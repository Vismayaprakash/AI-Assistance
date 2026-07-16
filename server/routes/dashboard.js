const express = require('express');
const router = express.Router();
const path = require('path');

// Serve dashboard pages
router.get('/dashboard', (req, res) => {
  res.redirect('/dashboard/login.html');
});

module.exports = router;
