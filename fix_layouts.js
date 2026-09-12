const fs = require('fs');

function fixRidePage() {
  const path = 'frontend-user/src/pages/RidePage.jsx';
  let content = fs.readFileSync(path, 'utf8');

  // We need to add a closing </div> before {isChatOpen && activeOrderId && (
  // We missed it because the previous script looked for `{/* isChatOpen` which didn't exist
  // We added `<div className="flex-1 overflow-y-auto pb-6">` and we need to close it.
  
  if (!content.includes('      </div>\n      {isChatOpen && activeOrderId && (')) {
    content = content.replace(
      /      \{isChatOpen && activeOrderId && \(/,
      `      </div>\n      {isChatOpen && activeOrderId && (`
    );
    fs.writeFileSync(path, content, 'utf8');
    console.log("Fixed closing tag in RidePage");
  }
}

fixRidePage();
