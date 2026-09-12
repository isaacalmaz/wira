const fs = require('fs');

// 1. Fix Admin Geofencing Saving Format (Save Geometry instead of FeatureCollection)
const adminPath = 'frontend-admin/src/pages/FeatureFlagsPage.jsx';
let adminContent = fs.readFileSync(adminPath, 'utf8');

const oldSaveLogic = `if (features.length > 0) {
            geojsonToSave = { type: 'FeatureCollection', features };
          }`;
const newSaveLogic = `if (features.length > 0) {
            geojsonToSave = features[0].geometry;
          }`;

if (adminContent.includes(oldSaveLogic)) {
    adminContent = adminContent.replace(oldSaveLogic, newSaveLogic);
    fs.writeFileSync(adminPath, adminContent);
    console.log('[OK] Admin Map Save Logic fixed');
} else {
    console.log('[SKIP/WARN] Admin Map logic not found or already changed.');
}

// 2. Reactivate GPS Enforcement in User App
const userPath = 'frontend-user/src/pages/HomePage.jsx';
let userContent = fs.readFileSync(userPath, 'utf8');

const oldRollbackInit = `const init = async () => {
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

const newReactivatedInit = `const init = async () => {
      const flags = await fetchGlobalFlags();
      fetchLocationAndZones(flags);
    };`;

if (userContent.includes(oldRollbackInit)) {
    userContent = userContent.replace(oldRollbackInit, newReactivatedInit);
    console.log('[OK] GPS Enforcement reactivated in init');
}

const oldRollbackListener = `const updateServices = () => {
          const updatedServices = SERVICES.map(srv => {
            const flag = globalFlags.find(f => f.id === srv.id);
            const isGloballyEnabled = flag ? flag.status : srv.enabled;
            // TEMPORARY ROLLBACK: Ignore zone check
            return { ...srv, enabled: isGloballyEnabled };
          });
          setActiveServices(updatedServices);
       };`;

const newReactivatedListener = `const updateServices = () => {
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

if (userContent.includes(oldRollbackListener)) {
    userContent = userContent.replace(oldRollbackListener, newReactivatedListener);
    console.log('[OK] GPS Enforcement reactivated in listener');
}

fs.writeFileSync(userPath, userContent);
