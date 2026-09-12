const fs = require('fs');
const path = 'frontend-user/src/pages/HomePage.jsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the init() function to bypass GPS
const oldInit = `const init = async () => {
      const flags = await fetchGlobalFlags();
      fetchLocationAndZones(flags);
    };`;

const newInit = `const init = async () => {
      const flags = await fetchGlobalFlags();
      // TEMPORARY ROLLBACK: Skip GPS check and enable based on Global Flags only
      const updatedServices = SERVICES.map(srv => {
        const flag = flags.find(f => f.id === srv.id);
        return { ...srv, enabled: flag ? flag.status : srv.enabled };
      });
      setActiveServices(updatedServices);
      setIsLoadingLocation(false);
      // fetchLocationAndZones(flags); // Disabled temporarily
    };`;

if (content.includes(oldInit)) {
    content = content.replace(oldInit, newInit);
} else {
    // If exact match fails, just regex replace
    content = content.replace(/const init = async \(\) => \{[\s\S]*?\};\n/g, newInit + '\n');
}

// Also patch the realtime listener's updateServices
const oldListener = `const updateServices = () => {
          const updatedServices = SERVICES.map(srv => {
            const flag = globalFlags.find(f => f.id === srv.id);
            const isGloballyEnabled = flag ? flag.status : srv.enabled;

            let isZoneEnabled = false;
            if (userZones && userZones.length > 0) {
              const serviceKey = srv.id.replace('wira_', '');
              isZoneEnabled = userZones.some(zone => zone.services && zone.services[serviceKey] === true);
            }

            return { ...srv, enabled: isGloballyEnabled && isZoneEnabled };
          });
          setActiveServices(updatedServices);
       };`;

const newListener = `const updateServices = () => {
          const updatedServices = SERVICES.map(srv => {
            const flag = globalFlags.find(f => f.id === srv.id);
            const isGloballyEnabled = flag ? flag.status : srv.enabled;
            // TEMPORARY ROLLBACK: Ignore zone check
            return { ...srv, enabled: isGloballyEnabled };
          });
          setActiveServices(updatedServices);
       };`;

content = content.replace(oldListener, newListener);

fs.writeFileSync(path, content);
console.log('GPS Rolled Back!');
