// Auto-assigns products to product groups using rule-based matching.
// Each rule has must-match patterns (AND) and must-not-match patterns (AND-NOT).
// First matching rule wins. Runs after product creation in the pipeline.

import type { ProductForm } from '../shared/types'

export interface GroupRule {
  groupId: string
  mustMatch: RegExp[]
  mustNotMatch: RegExp[]
  productForm: ProductForm
}

/**
 * Product group assignment rules.
 * Order matters — more specific rules must come before broader ones.
 * Each rule requires ALL mustMatch patterns to match, and NONE of the mustNotMatch.
 */
export const GROUP_RULES: GroupRule[] = [
  // ============================================================
  // DAIRY
  // ============================================================
  {
    groupId: 'milk-whole-1l',
    mustMatch: [/\b(milch|milk|vollmilch|halbfettmilch)\b/i],
    mustNotMatch: [/schoko/i, /kokos/i, /mandel/i, /hafer/i, /soja/i, /reis/i, /drink/i, /pudding/i, /dessert/i, /glace/i, /shake/i, /caramel/i, /branche/i, /pralin/i, /kägi/i, /alpes/i],
    productForm: 'raw',
  },
  {
    groupId: 'milk-plant',
    mustMatch: [/(hafermilch|haferdrink|mandelmilch|sojamilch|reismilch|sojadrink|oat\s*milk)/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'yogurt-plain',
    mustMatch: [/\b(joghurt|jogurt|yoghurt)\b/i],
    mustNotMatch: [/twix/i, /mars/i, /snickers/i, /riegel/i, /schokolade/i],
    productForm: 'raw',
  },
  {
    groupId: 'butter-250g',
    mustMatch: [/\b(butter|bratbutter|vorzugsbutter)\b/i],
    mustNotMatch: [/guezli/i, /gipfel/i, /erdnuss/i, /cookie/i, /schokolade/i, /croissant/i, /cordon/i],
    productForm: 'raw',
  },
  {
    groupId: 'gruyere',
    mustMatch: [/\b(gruyère|gruyere)\b/i],
    mustNotMatch: [/fondue/i],
    productForm: 'raw',
  },
  {
    groupId: 'emmentaler',
    mustMatch: [/\bemmentaler\b/i],
    mustNotMatch: [/fondue/i],
    productForm: 'raw',
  },
  {
    groupId: 'appenzeller',
    mustMatch: [/\bappenzeller\b/i],
    mustNotMatch: [/fondue/i, /bärli/i, /biber/i],
    productForm: 'raw',
  },
  {
    groupId: 'cheese-hard',
    mustMatch: [/\b(käse|reibkäse)\b/i],
    mustNotMatch: [/schnitzel/i, /cordon/i, /fondue/i, /gruyère/i, /gruyere/i, /emmentaler/i, /appenzeller/i],
    productForm: 'raw',
  },
  {
    groupId: 'mozzarella',
    mustMatch: [/\b(mozzarella|burrata)\b/i],
    mustNotMatch: [/schnitzel/i, /pizza/i, /panini/i],
    productForm: 'raw',
  },
  {
    groupId: 'feta',
    mustMatch: [/\bfeta\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'cream',
    mustMatch: [/\b(rahm|sahne|halbrahm|vollrahm)\b/i],
    mustNotMatch: [/glace/i, /eis/i],
    productForm: 'raw',
  },
  {
    groupId: 'quark',
    mustMatch: [/\bquark\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },

  // ============================================================
  // EGGS
  // ============================================================
  {
    groupId: 'eggs-6pack',
    mustMatch: [/\beier\b/i],
    mustNotMatch: [/nudeln/i, /hörnli/i, /penne/i, /magronen/i, /spaghetti/i, /teigwaren/i, /pasta/i],
    productForm: 'raw',
  },

  // ============================================================
  // POULTRY (specific cuts before general)
  // ============================================================
  {
    groupId: 'chicken-wings',
    mustMatch: [/(pouletflügeli|pouletflügel|chicken\s*wings|poulet\s*flügeli)/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'chicken-thigh',
    mustMatch: [/(pouletschenkel|poulet\s*schenkel|oberschenkel)/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'chicken-nuggets',
    mustMatch: [/(poulet\s*nuggets|chicken\s*nuggets|poulet\s*knusperli|poulet\s*crispy)/i],
    mustNotMatch: [],
    productForm: 'ready-meal',
  },
  {
    groupId: 'chicken-whole',
    mustMatch: [/(poulet\s*ganz|ganzes\s*poulet|bratpoulet)/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'chicken-breast',
    mustMatch: [/(pouletbrust|pouletschnitzel|pouletbrustfilet|poulet\s*brust)/i],
    mustNotMatch: [/flügeli/i, /wings/i, /schenkel/i, /nuggets/i],
    productForm: 'raw',
  },

  // ============================================================
  // MEAT
  // ============================================================
  {
    groupId: 'beef-minced',
    mustMatch: [/(hackfleisch|rindshackfleisch|rindshack)/i],
    mustNotMatch: [/burger/i, /bällchen/i, /bolognese/i],
    productForm: 'raw',
  },
  {
    groupId: 'pork-schnitzel',
    mustMatch: [/(schweineschnitzel|schnitzel)/i],
    mustNotMatch: [/poulet/i, /cordon/i],
    productForm: 'raw',
  },
  {
    groupId: 'salami',
    mustMatch: [/\b(salami|salametti)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'ham',
    mustMatch: [/\b(schinken|hinterschinken|kochschinken)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'sausage',
    mustMatch: [/\b(cervelat|bratwurst|wienerli)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },

  // ============================================================
  // FISH
  // ============================================================
  {
    groupId: 'salmon-smoked',
    mustMatch: [/(räucherlachs|lachs\s*geräuchert|smoked\s*salmon)/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'salmon',
    mustMatch: [/\b(lachs|salmon)\b/i],
    mustNotMatch: [/räucher/i, /geräuchert/i, /smoked/i],
    productForm: 'raw',
  },
  {
    groupId: 'shrimp',
    mustMatch: [/\b(crevetten|shrimp|garnelen)\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },

  // ============================================================
  // BREAD
  // ============================================================
  {
    groupId: 'zopf',
    mustMatch: [/\b(zopf|butterzopf)\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'naan-bread',
    mustMatch: [/\bnaan\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'bread-assorted',
    mustMatch: [/\b(brot|ruchbrot|toast|toastbrot)\b/i],
    mustNotMatch: [/aufstrich/i, /chips/i, /stängel/i, /crouton/i],
    productForm: 'raw',
  },

  // ============================================================
  // VEGETABLES (specific before general)
  // ============================================================
  {
    groupId: 'tomato-puree',
    mustMatch: [/(tomatenpüree|tomatenpuree|tomatenmark|tomatenkonzentrat)/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'tomato-sauce',
    mustMatch: [/(tomatensauce|tomatensugo|passata|sugo)/i],
    mustNotMatch: [/pizza/i],
    productForm: 'processed',
  },
  {
    groupId: 'tomatoes-canned',
    mustMatch: [/\b(pelati|tomatenstücke|tomatenstucke|geschälte\s*tomaten)\b/i],
    mustNotMatch: [],
    productForm: 'canned',
  },
  {
    groupId: 'tomatoes-fresh',
    mustMatch: [/\b(tomaten|cherry|rispentomaten)\b/i],
    mustNotMatch: [/püree/i, /puree/i, /sauce/i, /mark/i, /ketchup/i, /sugo/i, /passata/i, /pelati/i, /getrocknet/i, /stücke/i, /konzentrat/i, /paste/i],
    productForm: 'raw',
  },
  {
    groupId: 'potato-ready-meal',
    mustMatch: [/(kartoffel.*(cubes|gratin|stock|püree|smoky|country)|rösti|kartoffelstock|kartoffelgratin|kartoffelpüree)/i],
    mustNotMatch: [],
    productForm: 'ready-meal',
  },
  {
    groupId: 'fries-frozen',
    mustMatch: [/(pommes\s*frites|kartoffel\s*frites|wedges|frites)/i],
    mustNotMatch: [],
    productForm: 'frozen',
  },
  {
    groupId: 'potatoes',
    mustMatch: [/\b(kartoffel|kartoffeln)\b/i],
    mustNotMatch: [/cubes/i, /gratin/i, /rösti/i, /stock/i, /püree/i, /chips/i, /frites/i, /wedges/i, /kroketten/i, /gnocchi/i, /smoky/i, /country/i],
    productForm: 'raw',
  },
  {
    groupId: 'onions',
    mustMatch: [/\bzwiebeln?\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'garlic',
    mustMatch: [/\b(knoblauch|knoblauchzehen)\b/i],
    mustNotMatch: [/spiess/i, /crevette/i, /poulet/i, /wurst/i, /pizza/i, /brot/i, /butter/i],
    productForm: 'raw',
  },
  {
    groupId: 'ginger',
    mustMatch: [/\bingwer\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'spinach',
    mustMatch: [/\b(spinat|blattspinat)\b/i],
    mustNotMatch: [/tortelloni/i, /ravioli/i, /pizza/i, /quiche/i, /lasagne/i, /cannelloni/i],
    productForm: 'raw',
  },
  {
    groupId: 'bell-peppers',
    mustMatch: [/\bpeperoni\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'zucchini',
    mustMatch: [/\b(zucchetti|zucchini)\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'eggplant',
    mustMatch: [/\b(aubergine|auberginen)\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'cucumber',
    mustMatch: [/\b(gurke|gurken|salatgurke)\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'carrots',
    mustMatch: [/\b(karotten|rüebli)\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'mushrooms',
    mustMatch: [/\b(champignons|pilze)\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },
  {
    groupId: 'salad-greens',
    mustMatch: [/\b(eisberg|rucola|nüsslisalat|kopfsalat)\b/i],
    mustNotMatch: [/dressing/i, /sauce/i],
    productForm: 'raw',
  },

  // ============================================================
  // FRUIT
  // ============================================================
  {
    groupId: 'bananas',
    mustMatch: [/\bbananen?\b/i],
    mustNotMatch: [/chips/i],
    productForm: 'raw',
  },
  {
    groupId: 'apples',
    mustMatch: [/\b(äpfel|apfel|gala|braeburn)\b/i],
    mustNotMatch: [/saft/i, /schorle/i, /essig/i, /mus/i],
    productForm: 'raw',
  },
  {
    groupId: 'strawberries',
    mustMatch: [/\berdbeeren?\b/i],
    mustNotMatch: [/konfitüre/i, /marmelade/i, /joghurt/i, /müesli/i, /drink/i, /actimel/i, /lc1/i, /glacé/i, /glace/i, /sirup/i, /cornet/i],
    productForm: 'raw',
  },
  {
    groupId: 'blueberries',
    mustMatch: [/\bheidelbeeren?\b/i],
    mustNotMatch: [/konfitüre/i, /marmelade/i, /joghurt/i, /müesli/i, /drink/i, /sirup/i],
    productForm: 'raw',
  },
  {
    groupId: 'raspberries',
    mustMatch: [/\bhimbeeren?\b/i],
    mustNotMatch: [/konfitüre/i, /marmelade/i, /joghurt/i, /müesli/i, /drink/i, /sirup/i],
    productForm: 'raw',
  },
  {
    groupId: 'berries',
    mustMatch: [/\bbeeren\b/i],
    mustNotMatch: [/konfitüre/i, /marmelade/i, /joghurt/i, /müesli/i, /erdbeeren/i, /himbeeren/i, /heidelbeeren/i, /preiselbeeren/i],
    productForm: 'raw',
  },

  // ============================================================
  // READY MEALS
  // ============================================================
  {
    groupId: 'hummus',
    mustMatch: [/\bhummus\b/i],
    mustNotMatch: [],
    productForm: 'ready-meal',
  },
  {
    groupId: 'tofu',
    mustMatch: [/\btofu\b/i],
    mustNotMatch: [],
    productForm: 'raw',
  },

  // ============================================================
  // LONG-LIFE
  // ============================================================
  {
    groupId: 'pasta-assorted',
    mustMatch: [/\b(spaghetti|penne|fusilli|rigatoni|farfalle|tagliatelle)\b/i],
    mustNotMatch: [/sauce/i, /fertig/i],
    productForm: 'dried',
  },
  {
    groupId: 'rice-assorted',
    mustMatch: [/\b(reis|basmati|jasmin)\b/i],
    mustNotMatch: [/milch/i, /drink/i, /risotto\s*fertig/i],
    productForm: 'dried',
  },
  {
    groupId: 'coconut-milk',
    mustMatch: [/\b(kokosmilch|kokosnussmilch|coconut\s*milk)\b/i],
    mustNotMatch: [],
    productForm: 'canned',
  },
  {
    groupId: 'lentils',
    mustMatch: [/\blinsen\b/i],
    mustNotMatch: [],
    productForm: 'canned',
  },
  {
    groupId: 'chickpeas',
    mustMatch: [/\bkichererbsen\b/i],
    mustNotMatch: [],
    productForm: 'canned',
  },
  {
    groupId: 'olives',
    mustMatch: [/\boliven\b/i],
    mustNotMatch: [/öl/i],
    productForm: 'canned',
  },
  {
    groupId: 'tuna-canned',
    mustMatch: [/\bthunfisch\b/i],
    mustNotMatch: [/frisch/i, /steak/i],
    productForm: 'canned',
  },
  {
    groupId: 'beans-canned',
    mustMatch: [/\b(kidneybohnen|bohnen)\b/i],
    mustNotMatch: [/kaffee/i],
    productForm: 'canned',
  },
  {
    groupId: 'olive-oil',
    mustMatch: [/\bolivenöl\b/i],
    mustNotMatch: [/piadina/i, /brot/i, /pizza/i],
    productForm: 'processed',
  },
  {
    groupId: 'cooking-oil',
    mustMatch: [/\b(sonnenblumenöl|rapsöl)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'flour',
    mustMatch: [/\b(mehl|weissmehl|ruchmehl)\b/i],
    mustNotMatch: [],
    productForm: 'dried',
  },
  {
    groupId: 'sugar',
    mustMatch: [/\b(zucker|rohrzucker)\b/i],
    mustNotMatch: [/getränk/i, /drink/i],
    productForm: 'processed',
  },
  {
    groupId: 'coffee-assorted',
    mustMatch: [/\b(kaffee|espresso)\b/i],
    mustNotMatch: [/rahm/i, /glace/i, /sirup/i],
    productForm: 'processed',
  },
  {
    groupId: 'tea-assorted',
    mustMatch: [/\btee\b/i],
    mustNotMatch: [],
    productForm: 'dried',
  },
  {
    groupId: 'chocolate-assorted',
    mustMatch: [/\b(schokolade|tafelschokolade)\b/i],
    mustNotMatch: [/milch/i, /drink/i, /pudding/i],
    productForm: 'processed',
  },
  {
    groupId: 'chips',
    mustMatch: [/\bchips\b/i],
    mustNotMatch: [/schoko/i],
    productForm: 'processed',
  },
  {
    groupId: 'muesli',
    mustMatch: [/\b(müesli|birchermüesli|müsli|muesli)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'nuts',
    mustMatch: [/\b(nüsse|mandeln|cashew|erdnüsse)\b/i],
    mustNotMatch: [/butter/i, /creme/i, /aufstrich/i],
    productForm: 'raw',
  },

  // ============================================================
  // DRINKS (specific before general)
  // ============================================================
  {
    groupId: 'wine-red',
    mustMatch: [/\b(rotwein|primitivo|merlot|cabernet|pinot\s*noir|tempranillo|chianti|rioja|barolo|barbera|amarone|montepulciano|sangiovese)\b/i],
    mustNotMatch: [/essig/i],
    productForm: 'processed',
  },
  {
    groupId: 'wine-white',
    mustMatch: [/\b(weisswein|chardonnay|sauvignon\s*blanc|riesling|pinot\s*grigio|pinot\s*gris|prosecco|grauburgunder|müller.thurgau|fendant|chasselas|aigle)\b/i],
    mustNotMatch: [/essig/i],
    productForm: 'processed',
  },
  {
    groupId: 'wine-rose',
    mustMatch: [/\b(rosé|roséwein)\b/i],
    mustNotMatch: [/essig/i, /creme/i, /dusch/i],
    productForm: 'processed',
  },
  {
    groupId: 'beer',
    mustMatch: [/\b(bier|lager|pils|feldschlösschen|appenzeller\s*bier|calanda|quöllfrisch|eichhof|cardinal|chopfab)\b/i],
    mustNotMatch: [/essig/i, /bierhefe/i],
    productForm: 'processed',
  },
  {
    groupId: 'mineral-water',
    mustMatch: [/\b(mineralwasser|henniez|valser|aproz|evian|volvic|contrex)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'juice',
    mustMatch: [/\b(orangensaft|apfelsaft|multivitamin|fruchtsaft|nektar)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },

  // ============================================================
  // FROZEN / READY MEALS (specific)
  // ============================================================
  {
    groupId: 'frozen-pizza',
    mustMatch: [/\b(pizza|tiefkühlpizza|steinofen.?pizza)\b/i],
    mustNotMatch: [/sauce/i, /gewürz/i, /teig\b/i],
    productForm: 'frozen',
  },

  // ============================================================
  // NON-FOOD
  // ============================================================
  {
    groupId: 'laundry-detergent',
    mustMatch: [/\b(waschmittel|waschpulver)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'dish-soap',
    mustMatch: [/\b(abwaschmittel|geschirrspül)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'all-purpose-cleaner',
    mustMatch: [/\b(reiniger|allzweckreiniger|putzmittel)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'toilet-paper',
    mustMatch: [/\b(toilettenpapier|wc-papier)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'paper-towels',
    mustMatch: [/\b(küchenpapier|haushaltpapier)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'shampoo',
    mustMatch: [/\bshampoo\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'shower-gel',
    mustMatch: [/\b(duschgel|shower)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'toothpaste',
    mustMatch: [/\b(zahnpasta|zahncreme)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
  {
    groupId: 'deodorant',
    mustMatch: [/\b(deo|deodorant)\b/i],
    mustNotMatch: [],
    productForm: 'processed',
  },
]

/**
 * Attempt to assign a product to a product group based on its name.
 * Returns the group ID and product form, or null if no rule matches.
 */
export function assignProductGroup(
  productName: string,
): { groupId: string; productForm: ProductForm } | null {
  const nameLower = productName.toLowerCase()

  for (const rule of GROUP_RULES) {
    const allMatch = rule.mustMatch.every((r) => r.test(nameLower))
    if (!allMatch) continue

    const noneExcluded = rule.mustNotMatch.every((r) => !r.test(nameLower))
    if (!noneExcluded) continue

    return { groupId: rule.groupId, productForm: rule.productForm }
  }

  return null
}
