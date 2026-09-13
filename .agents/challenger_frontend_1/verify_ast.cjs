const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');
const parser = require(path.join(rootDir, 'node_modules/@babel/parser'));
const traverse = require(path.join(rootDir, 'node_modules/@babel/traverse')).default;

const HOME_PAGE_PATH = path.join(rootDir, 'frontend-user/src/pages/HomePage.jsx');

console.log('=== AST ADVERSARIAL ANALYSIS OF HomePage.jsx ===\n');

const code = fs.readFileSync(HOME_PAGE_PATH, 'utf-8');
const ast = parser.parse(code, {
  sourceType: 'module',
  plugins: ['jsx']
});

const forbiddenMemberProps = ['geolocation', 'getCurrentPosition', 'watchPosition'];
const forbiddenRPCs = ['get_zone_for_location'];
const forbiddenIdentifiers = ['userZones', 'locationWarning', 'isLoadingLocation', 'fetchLocationAndZones'];
const forbiddenStringSubstrings = ['Lokasi Terbatas', 'Izin lokasi ditolak', 'Menentukan lokasi Anda'];

const findings = [];

traverse(ast, {
  MemberExpression(astPath) {
    const propName = astPath.node.property.name || astPath.node.property.value;
    if (forbiddenMemberProps.includes(propName)) {
      findings.push({
        type: 'Forbidden MemberExpression',
        name: propName,
        line: astPath.node.loc?.start.line
      });
    }
  },
  CallExpression(astPath) {
    // Check if calling supabase.rpc('get_zone_for_location')
    const callee = astPath.node.callee;
    if (
      callee.type === 'MemberExpression' &&
      callee.property.name === 'rpc' &&
      astPath.node.arguments.length > 0 &&
      astPath.node.arguments[0].type === 'StringLiteral' &&
      forbiddenRPCs.includes(astPath.node.arguments[0].value)
    ) {
      findings.push({
        type: 'Forbidden RPC Call',
        rpc: astPath.node.arguments[0].value,
        line: astPath.node.loc?.start.line
      });
    }

    if (callee.type === 'Identifier' && forbiddenIdentifiers.includes(callee.name)) {
      findings.push({
        type: 'Forbidden Function Call',
        name: callee.name,
        line: astPath.node.loc?.start.line
      });
    }
  },
  Identifier(astPath) {
    if (forbiddenIdentifiers.includes(astPath.node.name)) {
      findings.push({
        type: 'Forbidden Identifier',
        name: astPath.node.name,
        line: astPath.node.loc?.start.line
      });
    }
  },
  StringLiteral(astPath) {
    for (const sub of forbiddenStringSubstrings) {
      if (astPath.node.value.includes(sub)) {
        findings.push({
          type: 'Forbidden String Literal',
          value: astPath.node.value,
          matched: sub,
          line: astPath.node.loc?.start.line
        });
      }
    }
  },
  JSXText(astPath) {
    for (const sub of forbiddenStringSubstrings) {
      if (astPath.node.value.includes(sub)) {
        findings.push({
          type: 'Forbidden JSX Text',
          value: astPath.node.value.trim(),
          matched: sub,
          line: astPath.node.loc?.start.line
        });
      }
    }
  }
});

console.log(`Total AST nodes scanned. Findings count: ${findings.length}`);

if (findings.length > 0) {
  console.error('Violations found in AST:', findings);
  process.exit(1);
} else {
  console.log('✅ AST Verification Clean: Zero GPS calls, zero zone queries, zero geofencing warning UI elements.');
  process.exit(0);
}
