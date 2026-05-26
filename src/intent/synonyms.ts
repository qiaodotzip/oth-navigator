/** Local keyword → serviceId resolution (Phase 1, offline). Longer keyword
 *  matches score higher (see resolveLocal). serviceIds are the ids in
 *  public/data/services.json. */
export const INTENT_SYNONYMS: { serviceId: string; keywords: string[] }[] = [
  { serviceId: "servicesg", keywords: ["passport", "nric", "renew", "identity card", "servicesg", "service sg", "government document", "document", "documents"] },
  { serviceId: "cpf", keywords: ["cpf", "retirement", "provident fund", "silver support", "workfare"] },
  { serviceId: "hdb", keywords: ["hdb", "housing", "flat", "bto", "rental", "housing grant", "lease", "mortgage"] },
  { serviceId: "library", keywords: ["library", "book", "books", "borrow", "reading", "reserve book"] },
  { serviceId: "theatre", keywords: ["theatre", "theater", "show", "performance", "play", "concert", "event", "ticket", "tickets"] },
  { serviceId: "hawker", keywords: ["food", "eat", "hawker", "lunch", "dinner", "meal", "coffee", "hungry"] },
  { serviceId: "family-nexus", keywords: ["baby", "child", "children", "vaccination", "immunisation", "parenthood", "family nexus", "preschool"] },
  { serviceId: "family-medicine-clinic", keywords: ["doctor", "clinic", "sick", "medical", "medicine", "gp", "health check", "unwell"] },
  { serviceId: "family-service-centre", keywords: ["family service", "counselling", "social worker", "comcare", "financial help", "assistance"] },
  { serviceId: "community-centre", keywords: ["community", "activity", "class", "course", "interest group"] },
  { serviceId: "active-ageing", keywords: ["elderly", "senior", "ageing", "aging", "active ageing"] },
];

/** Quick-start tiles shown under the ask box. label is bilingual; query is fed
 *  to resolveLocal exactly as if typed. */
export const PURPOSE_TILES: { en: string; zh: string; query: string; iconKey: string }[] = [
  { en: "Documents", zh: "证件", query: "renew document", iconKey: "info" },
  { en: "Housing / HDB", zh: "组屋", query: "hdb housing", iconKey: "receipt" },
  { en: "Borrow books", zh: "借书", query: "library books", iconKey: "book" },
  { en: "Family & Care", zh: "家庭关怀", query: "family nexus baby", iconKey: "hospital" },
];
