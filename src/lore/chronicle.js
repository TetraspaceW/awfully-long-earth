// Chronicle text that does not depend on the dynamics: milestone sentences for
// each technology level.

// beyond Terra's present the future is speculation; far from Terra, a sheet can
// reach those levels in what is Terra's distant past
export const milestoneText = (t, r, Y) => (Y > 2000 && /post-industrial|Spaceports/.test(t) ? '(Speculative) ' : '') + t.replace('{r}', r);

export const MILESTONES = {
  1: 'Farming villages appear around {r}.',
  2: 'Copper-working chiefdoms arise in {r}.',
  3: 'Bronze, writing and the first cities appear in {r}.',
  4: 'Iron-working spreads out from {r}.',
  5: 'A classical age of coinage, philosophy and great roads dawns in {r}.',
  6: 'Agrarian states mature; {r} becomes a centre of learning and long-distance trade.',
  7: 'Printing, gunpowder and ocean-going ships transform {r}.',
  8: 'Industrialisation begins in {r}.',
  9: '{r} enters the information age.',
  10: '{r} becomes post-industrial: automated, long-lived and post-scarcity.',
  11: 'Spaceports and orbital industry rise in {r}.',
};

// Event categories shown in chronicles.
export const EVENT_KINDS = { polity: 'State', war: 'War', culture: 'People', tech: 'Ideas', disaster: 'Disaster', contact: 'Contact', earth: 'Record' };
