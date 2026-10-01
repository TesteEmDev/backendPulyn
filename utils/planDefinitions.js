// utils/planDefinitions.js - planos da plataforma (valor mensal e limites)
// Usado pela visão de planos (routes/planos.js) e pelos detalhes do cliente (routes/clients.js).
const PLAN_DEFINITIONS = {
  starter: {
    name: 'Starter', price: 500, color: '#F59E0B', checkpointLimit: 3, eventsPerMonth: 4,
    features: ['Até 3 checkpoints simultâneos', 'Até 4 eventos por mês', 'Dashboard básico'],
  },
  professional: {
    name: 'Professional', price: 1000, color: '#29B6F6', checkpointLimit: 8, eventsPerMonth: 12,
    features: ['Até 8 checkpoints simultâneos', 'Até 12 eventos por mês', 'Dashboard completo'],
  },
  enterprise: {
    name: 'Enterprise', price: 2000, color: '#1E9BD7', checkpointLimit: -1, eventsPerMonth: -1,
    features: ['Checkpoints ilimitados', 'Eventos ilimitados', 'Dashboard completo + analytics'],
  },
};

module.exports = { PLAN_DEFINITIONS };
