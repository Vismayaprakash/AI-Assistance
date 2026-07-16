const { ChromaClient } = require('chromadb');
const config = require('../config');
const { generateEmbedding } = require('./llm');
const path = require('path');
const fs = require('fs');

let client;
const collections = {};
let isChromaAvailable = null;

/**
 * Check if ChromaDB is available
 */
async function checkChromaAvailability() {
  if (isChromaAvailable !== null) return isChromaAvailable;
  
  try {
    const chromaDir = config.chromaPath;
    if (!fs.existsSync(chromaDir)) {
      fs.mkdirSync(chromaDir, { recursive: true });
    }
    const tempClient = new ChromaClient({ path: undefined });
    await tempClient.version();
    client = tempClient;
    isChromaAvailable = true;
    console.log('✅ ChromaDB server is online and available');
  } catch (error) {
    isChromaAvailable = false;
    console.log('⚠️ ChromaDB server is offline. Falling back to SQLite keyword search.');
  }
  return isChromaAvailable;
}

/**
 * Initialize ChromaDB client
 */
async function getClient() {
  const available = await checkChromaAvailability();
  if (!available) return null;
  return client;
}

/**
 * Fallback local keyword search in SQLite
 */
function keywordSearch(entries, query, topK = 5) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (queryWords.length === 0) {
    return entries.slice(0, topK).map(e => ({
      content: `${e.title}: ${e.content}`,
      title: e.title,
      category: e.category,
      distance: 1.0
    }));
  }

  const scored = entries.map(entry => {
    const title = entry.title.toLowerCase();
    const content = entry.content.toLowerCase();
    let score = 0;

    queryWords.forEach(word => {
      if (title.includes(word)) score += 10;
      if (content.includes(word)) {
        const regex = new RegExp(word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
        const matches = content.match(regex);
        score += matches ? matches.length * 2 : 0;
      }
    });

    return { entry, score };
  });

  const sorted = scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => ({
      content: `${item.entry.title}: ${item.entry.content}`,
      title: item.entry.title,
      category: item.entry.category,
      distance: 1 - (item.score / 100)
    }));

  if (sorted.length > 0) {
    return sorted.slice(0, topK);
  }

  return entries.slice(0, topK).map(e => ({
    content: `${e.title}: ${e.content}`,
    title: e.title,
    category: e.category,
    distance: 1.0
  }));
}

/**
 * Get or create a collection for a business
 */
async function getCollection(businessId) {
  const chromaClient = await getClient();
  if (!chromaClient) return null; // Chroma is offline, return null for fallback

  if (collections[businessId]) {
    return collections[businessId];
  }

  const collectionName = `business_${businessId.replace(/-/g, '_')}`;

  try {
    const collection = await chromaClient.getOrCreateCollection({
      name: collectionName,
      metadata: { 'hnsw:space': 'cosine' }
    });
    collections[businessId] = collection;
    return collection;
  } catch (error) {
    console.error(`❌ Error creating collection for ${businessId}:`, error.message);
    return null; // Return null to trigger fallback
  }
}

/**
 * Embed and store a single knowledge entry
 */
async function embedAndStore(businessId, { id, title, content, category }) {
  const collection = await getCollection(businessId);
  if (!collection) {
    return { id, embedded: true, fallback: true };
  }
  const textToEmbed = `${title}: ${content}`;
  const embedding = await generateEmbedding(textToEmbed);

  await collection.upsert({
    ids: [id],
    embeddings: [embedding],
    documents: [textToEmbed],
    metadatas: [{ title, category, knowledge_id: id }]
  });

  return { id, embedded: true };
}

/**
 * Sync entire knowledge base for a business
 */
async function syncKnowledgeBase(businessId, entries) {
  const collection = await getCollection(businessId);
  if (!collection) {
    console.log(`ℹ️ ChromaDB offline: Skipped sync for business ${businessId} (using SQLite search fallback)`);
    return { synced: entries.length, fallback: true };
  }

  // Clear existing entries
  try {
    const existing = await collection.get();
    if (existing.ids.length > 0) {
      await collection.delete({ ids: existing.ids });
    }
  } catch (e) {
    // Collection might be empty, that's fine
  }

  if (entries.length === 0) {
    console.log(`ℹ️ No knowledge entries to sync for business ${businessId}`);
    return { synced: 0 };
  }

  // Embed all entries
  const ids = [];
  const embeddings = [];
  const documents = [];
  const metadatas = [];

  for (const entry of entries) {
    const textToEmbed = `${entry.title}: ${entry.content}`;
    const embedding = await generateEmbedding(textToEmbed);

    ids.push(entry.id);
    embeddings.push(embedding);
    documents.push(textToEmbed);
    metadatas.push({ title: entry.title, category: entry.category, knowledge_id: entry.id });
  }

  await collection.add({
    ids,
    embeddings,
    documents,
    metadatas
  });

  console.log(`✅ Synced ${entries.length} knowledge entries for business ${businessId}`);
  return { synced: entries.length };
}

/**
 * Query relevant knowledge chunks for a user query
 */
async function queryRelevant(businessId, query, topK = 5) {
  try {
    const collection = await getCollection(businessId);
    if (!collection) {
      // Fallback to SQLite local keyword search
      const KnowledgeModel = require('../database/models/knowledge');
      const entries = KnowledgeModel.getAllActiveText(businessId);
      return keywordSearch(entries, query, topK);
    }

    const queryEmbedding = await generateEmbedding(query);

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK
    });

    if (!results.documents || !results.documents[0]) {
      return [];
    }

    return results.documents[0].map((doc, i) => ({
      content: doc,
      title: results.metadatas[0][i]?.title || '',
      category: results.metadatas[0][i]?.category || '',
      distance: results.distances?.[0]?.[i] || 0
    }));
  } catch (error) {
    console.error(`❌ Query error for business ${businessId}:`, error.message);
    // Ultimate fallback if query fails (e.g. embedding service failure)
    try {
      const KnowledgeModel = require('../database/models/knowledge');
      const entries = KnowledgeModel.getAllActiveText(businessId);
      return keywordSearch(entries, query, topK);
    } catch (fallbackError) {
      return [];
    }
  }
}

/**
 * Remove a business's collection
 */
async function removeCollection(businessId) {
  const chromaClient = await getClient();
  const collectionName = `business_${businessId.replace(/-/g, '_')}`;

  try {
    await chromaClient.deleteCollection({ name: collectionName });
    delete collections[businessId];
  } catch (e) {
    // Collection might not exist
  }
}

module.exports = { embedAndStore, syncKnowledgeBase, queryRelevant, removeCollection, getCollection };
