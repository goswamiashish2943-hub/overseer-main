// packages/backend/src/contextBuilder.js
//
// Fetches previous analysis history for a file from the file_knowledge table.
// Gives the analysis engine cross-session context.

'use strict';

const { buildContext: buildLocalContext } = require('./core/supabase-store');

async function buildContext(projectId, filePath) {
  return buildLocalContext(projectId, filePath);
}

module.exports = { buildContext };
return '';
  }
}

module.exports = { buildContext };
