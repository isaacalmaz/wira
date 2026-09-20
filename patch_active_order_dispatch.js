const fs = require('fs');
const file = 'frontend-user/src/pages/ActiveOrderPage.jsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { useOrderDispatch }')) {
  content = content.replace(
    "import { useAuth } from '../context/AuthContext';",
    "import { useAuth } from '../context/AuthContext';\nimport { useOrderDispatch } from '../hooks/useOrderDispatch';"
  );
}

if (!content.includes('const { session } = useAuth();')) {
  content = content.replace(
    'const { user } = useAuth();',
    'const { user, session } = useAuth();'
  );
}

if (!content.includes('useOrderDispatch(order, session)')) {
  content = content.replace(
    'const [inputText, setInputText] = useState(\'\');',
    'const [inputText, setInputText] = useState(\'\');\n  const { pingedCount, totalCandidates } = useOrderDispatch(order, session);'
  );
}

fs.writeFileSync(file, content);
console.log('Patched ActiveOrderPage with Dispatch Hook');
