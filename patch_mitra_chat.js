const fs = require('fs');
const path = require('path');

function replaceChatButton(filePath) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add navigate if missing
    if (!content.includes('useNavigate')) {
      content = content.replace(/import \{.*\} from 'react-router-dom';/, match => match.replace('}', ', useNavigate }'));
      if (!content.includes('useNavigate')) {
        content = `import { useNavigate } from 'react-router-dom';\n` + content;
      }
    }
    
    if (content.includes('setIsChatOpen(true)')) {
      content = content.replace(/setIsChatOpen\(true\)/g, "navigate('active-order/' + activeOrder.id)");
    }
    
    // Check if navigate is declared
    if (!content.match(/const navigate = useNavigate\(\);/)) {
      content = content.replace(/(const \[activeOrder, setActiveOrder\] = useState\(null\);)/, "const navigate = useNavigate();\n  $1");
    }

    fs.writeFileSync(filePath, content);
    console.log(`Patched ${filePath}`);
  }
}

const mitraPages = [
  path.join(__dirname, 'frontend-mitra', 'src', 'pages', 'driver', 'DriverHomePage.jsx'),
  path.join(__dirname, 'frontend-mitra', 'src', 'pages', 'merchant', 'MerchantHomePage.jsx'),
  path.join(__dirname, 'frontend-mitra', 'src', 'pages', 'technician', 'TechHomePage.jsx'),
];

mitraPages.forEach(replaceChatButton);
