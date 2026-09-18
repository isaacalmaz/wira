const fs = require('fs');

const path = 'frontend-user/src/context/OrderContext.jsx';
let content = fs.readFileSync(path, 'utf8');

const mappingReplacement = `
      rawStatus: o.status,
      details: o.details,
      driver_name: o.driver_name,
      driver_id: o.driver_id,
      merchant_id: o.merchant_id,
      is_reviewed: o.is_reviewed,
      ...o
    };
  };
`;
content = content.replace(`      rawStatus: o.status,\n      details: o.details,\n      driver_name: o.driver_name,\n      ...o\n    };\n  };`, mappingReplacement);

fs.writeFileSync(path, content);
