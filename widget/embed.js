(function() {
  // Get script parameters
  const currentScript = document.currentScript;
  const scriptUrl = new URL(currentScript.src);
  const businessId = scriptUrl.searchParams.get('business_id');
  const serverUrl = scriptUrl.origin;

  if (!businessId) {
    console.error('AI Receptionist Embed Error: Missing business_id search parameter.');
    return;
  }

  // Inject widget CSS styles directly into parent page for the container and button
  const styles = `
    #ai-receptionist-widget-root {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .ai-widget-trigger {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .ai-widget-trigger:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }
    .ai-widget-trigger:active {
      transform: scale(0.95);
    }
    .ai-widget-trigger svg {
      width: 28px;
      height: 28px;
      color: #ffffff;
      transition: transform 0.3s;
    }
    .ai-widget-trigger.active svg {
      transform: rotate(90deg);
    }
    .ai-widget-iframe-container {
      position: absolute;
      bottom: 75px;
      right: 0;
      width: 380px;
      height: 580px;
      border-radius: 16px;
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      transform: scale(0.9);
      opacity: 0;
      pointer-events: none;
      transform-origin: bottom right;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
      background-color: #ffffff;
    }
    .ai-widget-iframe-container.open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    .ai-widget-iframe-container iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
    @media (max-width: 450px) {
      #ai-receptionist-widget-root {
        bottom: 10px;
        right: 10px;
      }
      .ai-widget-iframe-container {
        width: calc(100vw - 20px);
        height: calc(100vh - 100px);
        max-height: 600px;
      }
    }
  `;

  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  // Create widget DOM structure
  const widgetRoot = document.createElement('div');
  widgetRoot.id = 'ai-receptionist-widget-root';
  
  widgetRoot.innerHTML = `
    <div class="ai-widget-iframe-container" id="aiWidgetIframeContainer">
      <iframe src="${serverUrl}/widget/index.html?business_id=${businessId}" id="aiWidgetIframe"></iframe>
    </div>
    <div class="ai-widget-trigger" id="aiWidgetTrigger">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="triggerIconChat">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="triggerIconClose" style="display:none;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </div>
  `;

  document.body.appendChild(widgetRoot);

  const trigger = document.getElementById('aiWidgetTrigger');
  const container = document.getElementById('aiWidgetIframeContainer');
  const chatIcon = document.getElementById('triggerIconChat');
  const closeIcon = document.getElementById('triggerIconClose');

  let isOpen = false;

  function toggleWidget() {
    isOpen = !isOpen;
    if (isOpen) {
      container.classList.add('open');
      trigger.classList.add('active');
      chatIcon.style.display = 'none';
      closeIcon.style.display = 'block';
    } else {
      container.classList.remove('open');
      trigger.classList.remove('active');
      chatIcon.style.display = 'block';
      closeIcon.style.display = 'none';
    }
  }

  trigger.addEventListener('click', toggleWidget);

  // Customize trigger background based on business type
  fetch(`${serverUrl}/api/widget/business/${businessId}`)
    .then(r => r.json())
    .then(biz => {
      let color = '#3b82f6';
      let gradient = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
      if (biz.type === 'dental') {
        gradient = 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)';
      } else if (biz.type === 'salon') {
        gradient = 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)';
      }
      trigger.style.background = gradient;
    })
    .catch(() => {});

  // Listen for close message from inside the iframe
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'close-receptionist-widget') {
      if (isOpen) toggleWidget();
    }
  });
})();
