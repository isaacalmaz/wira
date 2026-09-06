const SERVICES = [
  { id: 'wira_ride', enabled: true },
  { id: 'wira_food', enabled: true },
  { id: 'wira_pool', enabled: true }
];

const flags = [
  { id: 'wira_ride', status: true },
  { id: 'wira_food', status: false },
  { id: 'wira_pool', status: false }
];

const applyFlags = (flags) => {
  const updatedServices = SERVICES.map(srv => {
    const flag = flags.find(f => f.id === srv.id);
    return { ...srv, enabled: flag ? flag.status : srv.enabled };
  });
  return updatedServices;
};

const activeServices = applyFlags(flags);
console.log(activeServices.filter((s) => s.enabled));
