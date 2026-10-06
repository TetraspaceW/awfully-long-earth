// Real Earth, 1 CE - 2000 CE, at 250-year snapshots. This is the fixed boundary
// condition every other tile is grown from. Coarse by design: provinces are modern
// countries (big ones split), and borders are approximate.

export const EARTH_YEARS = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];

// Culture families: [key, display name, hue]
export const EARTH_CULTURES = [
  ['latin', 'Romance (Latin)', 2], ['germanic', 'Germanic', 215], ['celtic', 'Celtic', 140],
  ['slavic', 'Slavic', 255], ['baltic', 'Baltic', 230], ['hellenic', 'Hellenic', 190],
  ['paleobalkan', 'Thraco-Dacian', 170], ['albanian', 'Albanian', 345], ['uralic', 'Uralic', 160],
  ['turkic', 'Turkic', 28], ['mongolic', 'Mongolic', 45], ['tungusic', 'Tungusic', 60],
  ['iranian', 'Iranian', 320], ['indoaryan', 'Indo-Aryan', 300], ['dravidian', 'Dravidian', 275],
  ['arabic', 'Arabic', 95], ['aramaic', 'Aramaic', 110], ['hebrew', 'Hebrew', 120],
  ['egyptian', 'Egyptian (Coptic)', 80], ['berber', 'Berber', 70], ['horn', 'Ethiopic & Cushitic', 125],
  ['nilosaharan', 'Nilo-Saharan', 20], ['westafrican', 'West African (Niger-Congo)', 35],
  ['bantu', 'Bantu', 50], ['khoisan', 'Khoisan', 15], ['sinitic', 'Sinitic', 355],
  ['tibetoburman', 'Tibeto-Burman', 330], ['japonic', 'Japonic', 290], ['koreanic', 'Koreanic', 265],
  ['taikadai', 'Tai-Kadai', 175], ['austroasiatic', 'Austroasiatic', 155], ['austronesian', 'Austronesian', 185],
  ['papuan', 'Papuan', 75], ['aboriginal', 'Aboriginal Australian', 10], ['eskimo', 'Eskimo-Aleut', 200],
  ['amerind_n', 'North American', 40], ['mesoamerican', 'Mesoamerican', 5], ['andean', 'Andean', 335],
  ['amazonian', 'Amazonian', 130], ['chibchan', 'Chibchan', 100], ['caucasian', 'Caucasian', 240],
  ['siberian', 'Paleo-Siberian', 205],
];

// Modern (2000) culture of each province; history below overrides earlier eras.
const MODERN_CULTURE = {
  latin: 'ESP PRT FRA ITA ROU MDA AND SMR MEX-N MEX-C MEX-Y GTM HND SLV NIC CRI PAN CUB DOM HTI PRI COL VEN ECU PER BOL CHL ARG-N ARG-S URY PRY BRA-N BRA-SE BRA-W FRA-GF CPV STP DMA LCA GRD MUS',
  germanic: 'GBR IRL IMN DEU AUT CHE NLD BEL LUX DNK NOR SWE ISL FRO USA-W USA-C USA-NE USA-SE USA-AK USA-HI CAN-W CAN-C CAN-E AUS-W AUS-C AUS-E NZL JAM BHS GUY SUR BLZ TTO FLK SGS CYM',
  slavic: 'RUS-NW RUS-V RUS-S RUS-WS RUS-CS RUS-FE UKR BLR POL CZE SVK SVN HRV BIH SRB MNE MKD BGR',
  baltic: 'LTU LVA', uralic: 'FIN EST HUN', hellenic: 'GRC CYP', albanian: 'ALB KOS',
  turkic: 'TUR AZE TKM UZB KAZ-W KAZ-E KGZ CHN-XJ', iranian: 'IRN AFG TJK', mongolic: 'MNG',
  caucasian: 'GEO ARM',
  arabic: 'SAU YEM OMN ARE QAT KWT IRQ SYR LBN JOR PSE EGY LBY TUN DZA MAR MRT SDN SAH',
  hebrew: 'ISR', horn: 'ETH ERI SOM SOL DJI', nilosaharan: 'SDS TCD',
  westafrican: 'SEN GMB GNB GIN SLE LBR CIV MLI BFA GHA TGO BEN NGA NER CAF',
  bantu: 'CMR COD COG GAB GNQ AGO ZMB ZWE MOZ MWI TZA KEN UGA RWA BDI ZAF LSO SWZ BWA NAM COM',
  austronesian: 'IDN-W IDN-JV IDN-K IDN-E MYS BRN PHL MDG TLS FJI SLB VUT NCL PYF WSM KIR FSM',
  papuan: 'PNG', sinitic: 'CHN-N CHN-S CHN-SW CHN-NE CHN-IM TWN SGP', tibetoburman: 'CHN-TB BTN MMR',
  japonic: 'JPN', koreanic: 'KOR PRK', taikadai: 'THA LAO', austroasiatic: 'VNM KHM',
  indoaryan: 'IND-N IND-E PAK BGD NPL LKA', dravidian: 'IND-S', eskimo: 'GRL CAN-N',
  null: 'ATA ATF',
};

// [year from which culture applies, culture]; the first entry covers 1 CE.
const CULTURE_HISTORY = {
  GBR: [[0, 'celtic'], [500, 'germanic']], IRL: [[0, 'celtic'], [2000, 'germanic']], IMN: [[0, 'celtic'], [2000, 'germanic']],
  FRA: [[0, 'celtic'], [250, 'latin']], BEL: [[0, 'celtic'], [250, 'latin'], [750, 'germanic']],
  CHE: [[0, 'celtic'], [250, 'latin'], [750, 'germanic']], AUT: [[0, 'celtic'], [750, 'germanic']],
  ROU: [[0, 'paleobalkan'], [750, 'latin']], MDA: [[0, 'paleobalkan'], [750, 'slavic'], [1500, 'latin']],
  BGR: [[0, 'paleobalkan'], [750, 'slavic']], MKD: [[0, 'paleobalkan'], [750, 'slavic']],
  SRB: [[0, 'paleobalkan'], [750, 'slavic']], MNE: [[0, 'paleobalkan'], [750, 'slavic']],
  BIH: [[0, 'paleobalkan'], [750, 'slavic']], HRV: [[0, 'paleobalkan'], [750, 'slavic']],
  SVN: [[0, 'celtic'], [750, 'slavic']], KOS: [[0, 'paleobalkan'], [750, 'slavic'], [2000, 'albanian']],
  HUN: [[0, 'celtic'], [750, 'turkic'], [1000, 'uralic']],
  POL: [[0, 'germanic'], [750, 'slavic']], CZE: [[0, 'germanic'], [750, 'slavic']], SVK: [[0, 'celtic'], [750, 'slavic']],
  UKR: [[0, 'iranian'], [500, 'slavic']], BLR: [[0, 'baltic'], [750, 'slavic']],
  'RUS-NW': [[0, 'uralic'], [1000, 'slavic']], 'RUS-V': [[0, 'uralic'], [750, 'turkic'], [1750, 'slavic']],
  'RUS-S': [[0, 'iranian'], [500, 'turkic'], [1750, 'slavic']], 'RUS-WS': [[0, 'uralic'], [2000, 'slavic']],
  'RUS-CS': [[0, 'siberian'], [2000, 'slavic']], 'RUS-FE': [[0, 'tungusic'], [2000, 'slavic']],
  ISL: [[0, null], [1000, 'germanic']], FRO: [[0, null], [1000, 'germanic']],
  TUR: [[0, 'hellenic'], [1500, 'turkic']], AZE: [[0, 'caucasian'], [1250, 'turkic']],
  TKM: [[0, 'iranian'], [1250, 'turkic']], UZB: [[0, 'iranian'], [1500, 'turkic']],
  'KAZ-W': [[0, 'iranian'], [500, 'turkic']], 'KAZ-E': [[0, 'iranian'], [500, 'turkic']],
  KGZ: [[0, 'iranian'], [750, 'turkic']], 'CHN-XJ': [[0, 'iranian'], [1000, 'turkic']],
  'CHN-IM': [[0, 'mongolic'], [2000, 'sinitic']], 'CHN-NE': [[0, 'tungusic'], [2000, 'sinitic']],
  'CHN-SW': [[0, 'tibetoburman'], [1500, 'sinitic']], 'CHN-S': [[0, 'taikadai'], [750, 'sinitic']],
  TWN: [[0, 'austronesian'], [1750, 'sinitic']], SGP: [[0, 'austronesian'], [2000, 'sinitic']],
  THA: [[0, 'austroasiatic'], [1250, 'taikadai']], LAO: [[0, 'austroasiatic'], [1500, 'taikadai']],
  IRQ: [[0, 'aramaic'], [1000, 'arabic']], SYR: [[0, 'aramaic'], [1000, 'arabic']], LBN: [[0, 'aramaic'], [1000, 'arabic']],
  JOR: [[0, 'arabic']], PSE: [[0, 'aramaic'], [1000, 'arabic']], ISR: [[0, 'aramaic'], [1000, 'arabic'], [2000, 'hebrew']],
  EGY: [[0, 'egyptian'], [1250, 'arabic']], LBY: [[0, 'berber'], [1250, 'arabic']], TUN: [[0, 'berber'], [1250, 'arabic']],
  DZA: [[0, 'berber'], [1500, 'arabic']], MAR: [[0, 'berber'], [1750, 'arabic']], MRT: [[0, 'berber'], [1750, 'arabic']],
  SAH: [[0, 'berber'], [1750, 'arabic']], SDN: [[0, 'nilosaharan'], [1750, 'arabic']],
  ZAF: [[0, 'khoisan'], [500, 'bantu']], NAM: [[0, 'khoisan'], [1500, 'bantu']], BWA: [[0, 'khoisan'], [1000, 'bantu']],
  AGO: [[0, 'khoisan'], [250, 'bantu']], ZWE: [[0, 'khoisan'], [250, 'bantu']], MOZ: [[0, 'khoisan'], [250, 'bantu']],
  LSO: [[0, 'khoisan'], [750, 'bantu']], SWZ: [[0, 'khoisan'], [750, 'bantu']],
  MDG: [[0, null], [750, 'austronesian']], NZL: [[0, null], [1500, 'austronesian'], [2000, 'germanic']],
  'USA-HI': [[0, null], [1000, 'austronesian'], [2000, 'germanic']],
  'USA-W': [[0, 'amerind_n'], [2000, 'germanic']], 'USA-C': [[0, 'amerind_n'], [2000, 'germanic']],
  'USA-NE': [[0, 'amerind_n'], [1750, 'germanic']], 'USA-SE': [[0, 'amerind_n'], [1750, 'germanic']],
  'USA-AK': [[0, 'eskimo'], [2000, 'germanic']], 'CAN-W': [[0, 'amerind_n'], [2000, 'germanic']],
  'CAN-C': [[0, 'amerind_n'], [2000, 'germanic']], 'CAN-E': [[0, 'amerind_n'], [2000, 'germanic']],
  'MEX-N': [[0, 'amerind_n'], [2000, 'latin']], 'MEX-C': [[0, 'mesoamerican'], [2000, 'latin']],
  'MEX-Y': [[0, 'mesoamerican'], [2000, 'latin']], GTM: [[0, 'mesoamerican'], [2000, 'latin']],
  BLZ: [[0, 'mesoamerican'], [2000, 'germanic']], HND: [[0, 'mesoamerican'], [2000, 'latin']],
  SLV: [[0, 'mesoamerican'], [2000, 'latin']], NIC: [[0, 'chibchan'], [2000, 'latin']],
  CRI: [[0, 'chibchan'], [2000, 'latin']], PAN: [[0, 'chibchan'], [2000, 'latin']],
  CUB: [[0, 'amazonian'], [1750, 'latin']], DOM: [[0, 'amazonian'], [1750, 'latin']], HTI: [[0, 'amazonian'], [1750, 'latin']],
  PRI: [[0, 'amazonian'], [1750, 'latin']], JAM: [[0, 'amazonian'], [1750, 'germanic']], BHS: [[0, 'amazonian'], [1750, 'germanic']],
  TTO: [[0, 'amazonian'], [2000, 'germanic']], COL: [[0, 'chibchan'], [1750, 'latin']], VEN: [[0, 'amazonian'], [1750, 'latin']],
  ECU: [[0, 'andean'], [2000, 'latin']], PER: [[0, 'andean'], [2000, 'latin']], BOL: [[0, 'andean'], [2000, 'latin']],
  CHL: [[0, 'andean'], [1750, 'latin']], 'ARG-N': [[0, 'andean'], [1750, 'latin']], 'ARG-S': [[0, 'amazonian'], [2000, 'latin']],
  URY: [[0, 'amazonian'], [1750, 'latin']], PRY: [[0, 'amazonian'], [2000, 'latin']],
  'BRA-SE': [[0, 'amazonian'], [1750, 'latin']], 'BRA-N': [[0, 'amazonian'], [2000, 'latin']], 'BRA-W': [[0, 'amazonian'], [2000, 'latin']],
  GUY: [[0, 'amazonian'], [1750, 'germanic']], SUR: [[0, 'amazonian'], [1750, 'germanic']], 'FRA-GF': [[0, 'amazonian'], [1750, 'latin']],
  'AUS-W': [[0, 'aboriginal'], [2000, 'germanic']], 'AUS-C': [[0, 'aboriginal'], [2000, 'germanic']], 'AUS-E': [[0, 'aboriginal'], [2000, 'germanic']],
  CPV: [[0, null], [1500, 'latin']], STP: [[0, null], [1500, 'latin']], MUS: [[0, null], [1750, 'latin'], [2000, 'indoaryan']],
  FLK: [[0, null], [2000, 'germanic']], SGS: [[0, null]], PYF: [[0, null], [1000, 'austronesian']],
  DMA: [[0, 'amazonian'], [1750, 'latin']], LCA: [[0, 'amazonian'], [1750, 'latin']], GRD: [[0, 'amazonian'], [1750, 'latin']],
  CYM: [[0, null], [1750, 'germanic']],
};

// Macro-areas and their technology level at each snapshot year (see ERAS).
const AREAS = {
  MED: [[5.2, 5.2, 4.9, 4.8, 5.0, 5.5, 6.6, 7.3], 'ITA ESP PRT GRC MLT CYP AND SMR'],
  EUW: [[4.0, 4.3, 4.2, 4.4, 4.9, 5.6, 6.6, 7.5], 'FRA BEL NLD LUX DEU AUT CHE GBR IRL IMN DNK'],
  EUE: [[3.4, 3.6, 3.7, 3.9, 4.4, 4.9, 5.8, 6.8], 'POL CZE SVK HUN SVN HRV BIH SRB MNE KOS ALB MKD BGR ROU MDA UKR BLR LTU LVA EST FIN SWE NOR ISL FRO RUS-NW'],
  NEA: [[5.2, 5.2, 5.2, 5.4, 5.6, 5.4, 5.7, 6.2], 'TUR SYR LBN ISR PSE JOR IRQ IRN EGY GEO ARM AZE KWT'],
  ARA: [[3.8, 3.9, 4.0, 4.8, 4.9, 4.8, 4.9, 5.0], 'SAU YEM OMN ARE QAT'],
  CAS: [[3.8, 3.9, 4.0, 4.4, 4.7, 4.8, 4.8, 5.3], 'TKM UZB TJK KGZ KAZ-W KAZ-E AFG CHN-XJ MNG CHN-IM RUS-S RUS-V'],
  IND: [[4.9, 5.0, 5.1, 5.0, 5.2, 5.3, 5.6, 6.0], 'IND-N IND-E IND-S PAK BGD NPL LKA BTN'],
  CHI: [[5.2, 5.0, 5.2, 5.6, 5.9, 6.0, 6.2, 6.6], 'CHN-N CHN-S CHN-SW'],
  CHP: [[3.2, 3.4, 3.6, 4.0, 4.3, 4.6, 5.0, 5.6], 'CHN-NE CHN-TB TWN'],
  EAS: [[3.6, 4.0, 4.4, 4.9, 5.2, 5.4, 5.8, 6.4], 'JPN KOR PRK'],
  SEA: [[3.5, 3.8, 4.2, 4.6, 5.0, 5.1, 5.4, 5.8], 'VNM KHM LAO THA MMR MYS SGP BRN IDN-W IDN-JV IDN-K PHL'],
  AFN: [[5.0, 5.0, 4.7, 4.9, 5.2, 5.3, 5.4, 5.6], 'LBY TUN DZA MAR'],
  SAH: [[2.5, 2.7, 3.2, 3.5, 3.9, 4.2, 4.4, 4.4], 'MRT MLI NER TCD SDN SAH SDS'],
  AFW: [[3.2, 3.4, 3.6, 3.8, 4.1, 4.4, 4.6, 4.8], 'SEN GMB GNB GIN SLE LBR CIV BFA GHA TGO BEN NGA CMR CAF CPV STP'],
  AFH: [[4.0, 4.2, 4.3, 4.1, 4.1, 4.3, 4.5, 4.7], 'ETH ERI SOM SOL DJI KEN TZA UGA RWA BDI COM'],
  AFS: [[2.4, 2.8, 3.0, 3.3, 3.6, 3.9, 4.2, 4.4], 'COD COG GAB GNQ AGO ZMB ZWE MOZ MWI ZAF LSO SWZ BWA NAM MDG MUS'],
  SIB: [[1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 3.5], 'RUS-WS RUS-CS RUS-FE GRL CAN-N USA-AK'],
  NAM: [[1.8, 1.9, 2.0, 2.2, 2.6, 2.8, 2.6, 4.5], 'USA-W USA-C USA-NE USA-SE CAN-W CAN-C CAN-E MEX-N USA-HI'],
  MES: [[4.0, 4.2, 4.4, 4.3, 4.3, 4.4, 4.6, 5.6], 'MEX-C MEX-Y GTM BLZ HND SLV'],
  CAR: [[2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 3.0, 5.6], 'NIC CRI PAN CUB DOM HTI PRI JAM BHS TTO DMA LCA GRD CYM COL VEN'],
  AND: [[3.6, 3.8, 4.0, 4.1, 4.1, 4.2, 4.6, 5.5], 'PER BOL ECU CHL ARG-N'],
  SAM: [[1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 4.0], 'BRA-N BRA-W BRA-SE PRY URY ARG-S GUY SUR FRA-GF FLK SGS'],
  OCE: [[1.2, 1.2, 1.4, 1.5, 1.6, 1.8, 1.9, 2.2], 'AUS-W AUS-C AUS-E NZL PNG IDN-E TLS FJI SLB VUT NCL PYF WSM KIR FSM'],
};
// Colonial-era exceptions (1750)
const TECH_1750 = { 'USA-NE': 6.8, 'USA-SE': 6.5, 'CAN-E': 5.2, ZAF: 4.8, 'BRA-SE': 5.5, CUB: 5.8, DOM: 5.5,
  JAM: 5.8, 'MEX-N': 5.0, ARG: 5.2, URY: 5.0, CHL: 5.5, PHL: 5.2, 'IDN-JV': 5.6, RUS: 6.5, 'RUS-WS': 4.5,
  'RUS-CS': 3.5, 'RUS-FE': 3.0, 'RUS-NW': 6.6, SWE: 7.0, NOR: 6.6, FIN: 6.4, ISL: 6.2 };
// 2000: Natural Earth income group 1..5
export const TECH_2000_BY_INCOME = [0, 9.2, 9.0, 8.4, 7.9, 7.3];

// Polities: key -> [name, culture, type, founded, ended, capital province]
// Keys "c:XXX" are modern countries (owners in 2000); earlier snapshots may borrow
// them for their predecessors, with names given per snapshot.
export const EARTH_POLITIES = {
  rome: ['Roman Empire', 'latin', 'empire', -753, 476, 'ITA'],
  byz: ['Eastern Roman Empire', 'hellenic', 'empire', 395, 1453, 'TUR'],
  parthia: ['Parthian Empire', 'iranian', 'empire', -247, 224, 'IRQ'],
  han: ['Han dynasty', 'sinitic', 'empire', -202, 220, 'CHN-N'],
  xiongnu: ['Xiongnu', 'mongolic', 'horde', -209, 155, 'MNG'],
  kushan: ['Yuezhi–Kushan realm', 'iranian', 'empire', -130, 375, 'AFG'],
  indoscyth: ['Indo-Scythian kingdoms', 'iranian', 'kingdom', -150, 60, 'PAK'],
  satavahana: ['Satavahana Empire', 'indoaryan', 'kingdom', -100, 224, 'IND-S'],
  magadha: ['Kingdom of Magadha', 'indoaryan', 'kingdom', -544, 320, 'IND-E'],
  anuradhapura: ['Anuradhapura Kingdom', 'indoaryan', 'kingdom', -437, 1017, 'LKA'],
  kush: ['Kingdom of Kush', 'nilosaharan', 'kingdom', -785, 350, 'SDN'],
  aksum: ['Kingdom of Aksum', 'horn', 'kingdom', 100, 960, 'ETH'],
  himyar: ['Himyarite Kingdom', 'arabic', 'kingdom', -110, 525, 'YEM'],
  nabataea: ['Nabataean Kingdom', 'arabic', 'kingdom', -168, 106, 'JOR'],
  armenia: ['Kingdom of Armenia', 'caucasian', 'kingdom', -331, 428, 'ARM'],
  kartli: ['Kingdom of Iberia (Kartli)', 'caucasian', 'kingdom', -302, 580, 'GEO'],
  dacia: ['Dacian Kingdom', 'paleobalkan', 'kingdom', -82, 106, 'ROU'],
  marcomanni: ['Marcomannic Kingdom', 'germanic', 'kingdom', -9, 50, 'CZE'],
  mauretania: ['Mauretania', 'berber', 'kingdom', -300, 40, 'MAR'],
  maya: ['Maya city-states', 'mesoamerican', 'city-states', -750, 1697, 'GTM'],
  teotihuacan: ['Teotihuacan', 'mesoamerican', 'city-states', -100, 550, 'MEX-C'],
  moche: ['Moche', 'andean', 'kingdom', 1, 800, 'PER'],
  sarmatians: ['Sarmatian confederacy', 'iranian', 'horde', -500, 375, 'RUS-S'],
  wusun: ['Wusun', 'iranian', 'horde', -160, 450, 'KGZ'],
  kangju: ['Kangju', 'iranian', 'horde', -200, 400, 'UZB'],
  goguryeo: ['Goguryeo', 'koreanic', 'kingdom', -37, 668, 'PRK'],
  silla: ['Silla', 'koreanic', 'kingdom', -57, 935, 'KOR'],
  sasanian: ['Sasanian Empire', 'iranian', 'empire', 224, 651, 'IRQ'],
  wei: ['Cao Wei', 'sinitic', 'kingdom', 220, 266, 'CHN-N'],
  shu: ['Shu Han', 'sinitic', 'kingdom', 221, 263, 'CHN-SW'],
  wu: ['Eastern Wu', 'sinitic', 'kingdom', 222, 280, 'CHN-S'],
  xianbei: ['Xianbei confederation', 'mongolic', 'horde', 93, 300, 'MNG'],
  vakataka: ['Vakataka dynasty', 'indoaryan', 'kingdom', 250, 500, 'IND-S'],
  funan: ['Funan', 'austroasiatic', 'kingdom', 50, 550, 'KHM'],
  ostrogoths: ['Ostrogothic Kingdom', 'germanic', 'kingdom', 493, 553, 'ITA'],
  visigoths: ['Visigothic Kingdom', 'germanic', 'kingdom', 418, 721, 'ESP'],
  francia: ['Frankish Realm', 'germanic', 'kingdom', 481, 843, 'FRA'],
  vandals: ['Vandal Kingdom', 'germanic', 'kingdom', 435, 534, 'TUN'],
  mauroroman: ['Mauro-Roman Kingdom', 'berber', 'kingdom', 429, 578, 'DZA'],
  hephthalites: ['Hephthalite Empire', 'iranian', 'horde', 440, 560, 'AFG'],
  gupta: ['Gupta Empire', 'indoaryan', 'empire', 320, 550, 'IND-E'],
  pallava: ['Pallava dynasty', 'dravidian', 'kingdom', 275, 897, 'IND-S'],
  nwei: ['Northern Wei', 'sinitic', 'empire', 386, 535, 'CHN-N'],
  sqi: ['Southern Qi', 'sinitic', 'kingdom', 479, 502, 'CHN-S'],
  rouran: ['Rouran Khaganate', 'mongolic', 'horde', 330, 555, 'MNG'],
  champa: ['Champa', 'austronesian', 'kingdom', 192, 1832, 'VNM'],
  ghana: ['Ghana Empire (Wagadu)', 'westafrican', 'empire', 300, 1100, 'MRT'],
  tiwanaku: ['Tiwanaku', 'andean', 'city-states', 110, 1000, 'BOL'],
  tarumanagara: ['Tarumanagara', 'austronesian', 'kingdom', 358, 669, 'IDN-JV'],
  abbasid: ['Abbasid Caliphate', 'arabic', 'empire', 750, 1258, 'IRQ'],
  cordoba: ['Emirate of Córdoba', 'arabic', 'kingdom', 756, 1031, 'ESP'],
  lombards: ['Lombard Kingdom', 'germanic', 'kingdom', 568, 774, 'ITA'],
  bulgaria1: ['First Bulgarian Empire', 'slavic', 'empire', 681, 1018, 'BGR'],
  avars: ['Avar Khaganate', 'turkic', 'horde', 567, 822, 'HUN'],
  khazars: ['Khazar Khaganate', 'turkic', 'horde', 650, 969, 'RUS-S'],
  tang: ['Tang dynasty', 'sinitic', 'empire', 618, 907, 'CHN-N'],
  tibet: ['Tibetan Empire', 'tibetoburman', 'empire', 618, 842, 'CHN-TB'],
  nanzhao: ['Nanzhao', 'tibetoburman', 'kingdom', 738, 902, 'CHN-SW'],
  uyghur: ['Uyghur Khaganate', 'turkic', 'horde', 744, 840, 'MNG'],
  balhae: ['Balhae', 'koreanic', 'kingdom', 698, 926, 'CHN-NE'],
  srivijaya: ['Srivijaya', 'austronesian', 'empire', 650, 1288, 'IDN-W'],
  medang: ['Medang (Mataram)', 'austronesian', 'kingdom', 732, 1006, 'IDN-JV'],
  chenla: ['Chenla', 'austroasiatic', 'kingdom', 550, 802, 'KHM'],
  dvaravati: ['Dvaravati', 'austroasiatic', 'city-states', 600, 1050, 'THA'],
  pyu: ['Pyu city-states', 'tibetoburman', 'city-states', -200, 1050, 'MMR'],
  pala: ['Pala Empire', 'indoaryan', 'empire', 750, 1161, 'IND-E'],
  rashtrakuta: ['Rashtrakuta dynasty', 'dravidian', 'empire', 753, 982, 'IND-S'],
  pratihara: ['Gurjara-Pratihara', 'indoaryan', 'empire', 730, 1036, 'IND-N'],
  makuria: ['Makuria', 'nilosaharan', 'kingdom', 450, 1365, 'SDN'],
  wari: ['Wari Empire', 'andean', 'empire', 600, 1000, 'PER'],
  karluks: ['Karluk Yabghu', 'turkic', 'horde', 756, 940, 'KGZ'],
  mercia: ['Mercia', 'germanic', 'kingdom', 527, 918, 'GBR'],
  hre: ['Holy Roman Empire', 'germanic', 'empire', 962, 1806, 'DEU'],
  pechenegs: ['Pecheneg and Oghuz hordes', 'turkic', 'horde', 850, 1091, 'RUS-S'],
  kievan: ["Kievan Rus'", 'slavic', 'kingdom', 882, 1240, 'UKR'],
  volgabulgaria: ['Volga Bulgaria', 'turkic', 'kingdom', 700, 1236, 'RUS-V'],
  fatimid: ['Fatimid Caliphate', 'arabic', 'empire', 909, 1171, 'EGY'],
  zirid: ['Zirid dynasty', 'berber', 'kingdom', 972, 1148, 'TUN'],
  buyid: ['Buyid dynasty', 'iranian', 'kingdom', 934, 1062, 'IRN'],
  karakhanid: ['Kara-Khanid Khanate', 'turkic', 'horde', 840, 1212, 'KGZ'],
  ghaznavid: ['Ghaznavid Empire', 'turkic', 'empire', 977, 1186, 'AFG'],
  song: ['Song dynasty', 'sinitic', 'empire', 960, 1279, 'CHN-N'],
  liao: ['Liao dynasty (Khitan)', 'mongolic', 'empire', 916, 1125, 'CHN-NE'],
  goryeo: ['Goryeo', 'koreanic', 'kingdom', 918, 1392, 'KOR'],
  khmer: ['Khmer Empire', 'austroasiatic', 'empire', 802, 1431, 'KHM'],
  pagan: ['Pagan Kingdom', 'tibetoburman', 'kingdom', 849, 1297, 'MMR'],
  chola: ['Chola Empire', 'dravidian', 'empire', 848, 1279, 'IND-S'],
  toltec: ['Toltec state', 'mesoamerican', 'kingdom', 900, 1168, 'MEX-C'],
  chimu: ['Chimú', 'andean', 'kingdom', 900, 1470, 'PER'],
  kanem: ['Kanem Empire', 'nilosaharan', 'empire', 700, 1900, 'TCD'],
  mississippian: ['Mississippian chiefdoms', 'amerind_n', 'chiefdom', 800, 1600, 'USA-C'],
  mongol: ['Mongol Empire', 'mongolic', 'empire', 1206, 1368, 'MNG'],
  dali: ['Dali Kingdom', 'tibetoburman', 'kingdom', 937, 1253, 'CHN-SW'],
  mamluk: ['Mamluk Sultanate', 'arabic', 'empire', 1250, 1517, 'EGY'],
  rum: ['Sultanate of Rum', 'turkic', 'kingdom', 1077, 1308, 'TUR'],
  nicaea: ['Empire of Nicaea', 'hellenic', 'kingdom', 1204, 1261, 'GRC'],
  hafsid: ['Hafsid Sultanate', 'berber', 'kingdom', 1229, 1574, 'TUN'],
  almohad: ['Almohad Caliphate', 'berber', 'empire', 1121, 1269, 'MAR'],
  zayyanid: ['Zayyanid Kingdom', 'berber', 'kingdom', 1235, 1556, 'DZA'],
  teutonic: ['Teutonic Order', 'germanic', 'theocracy', 1226, 1561, 'LVA'],
  vladimir: ['Grand Principality of Vladimir', 'slavic', 'kingdom', 1157, 1331, 'RUS-NW'],
  bulgaria2: ['Second Bulgarian Empire', 'slavic', 'kingdom', 1185, 1396, 'BGR'],
  delhi: ['Delhi Sultanate', 'indoaryan', 'empire', 1206, 1526, 'IND-N'],
  pandya: ['Pandya dynasty', 'dravidian', 'kingdom', 1190, 1345, 'IND-S'],
  sukhothai: ['Sukhothai Kingdom', 'taikadai', 'kingdom', 1238, 1438, 'THA'],
  singhasari: ['Singhasari', 'austronesian', 'kingdom', 1222, 1292, 'IDN-JV'],
  kilwa: ['Kilwa Sultanate', 'bantu', 'city-states', 957, 1513, 'TZA'],
  zimbabwe: ['Kingdom of Zimbabwe', 'bantu', 'kingdom', 1220, 1450, 'ZWE'],
  benin: ['Kingdom of Benin', 'westafrican', 'kingdom', 1180, 1897, 'NGA'],
  mayapan: ['League of Mayapán', 'mesoamerican', 'league', 1220, 1441, 'MEX-Y'],
  mali: ['Mali Empire', 'westafrican', 'empire', 1235, 1670, 'MLI'],
  ottoman: ['Ottoman Empire', 'turkic', 'empire', 1299, 1922, 'TUR'],
  safavid: ['Safavid Persia', 'iranian', 'empire', 1501, 1736, 'IRN'],
  bukhara: ['Khanate of Bukhara', 'turkic', 'kingdom', 1500, 1920, 'UZB'],
  timurids: ['Timurid Empire', 'turkic', 'empire', 1370, 1507, 'AFG'],
  kazakh: ['Kazakh Khanate', 'turkic', 'horde', 1465, 1847, 'KAZ-E'],
  nogai: ['Nogai Horde', 'turkic', 'horde', 1440, 1634, 'RUS-S'],
  kazan: ['Khanate of Kazan', 'turkic', 'kingdom', 1438, 1552, 'RUS-V'],
  sibir: ['Khanate of Sibir', 'turkic', 'horde', 1468, 1598, 'RUS-WS'],
  habsburg: ['Habsburg Monarchy', 'germanic', 'empire', 1526, 1918, 'AUT'],
  italy_states: ['Italian states', 'latin', 'city-states', 1100, 1861, 'ITA'],
  kalmar: ['Kalmar Union', 'germanic', 'kingdom', 1397, 1523, 'DNK'],
  ming: ['Ming dynasty', 'sinitic', 'empire', 1368, 1644, 'CHN-N'],
  nyuan: ['Northern Yuan', 'mongolic', 'horde', 1368, 1635, 'MNG'],
  moghulistan: ['Moghulistan', 'turkic', 'horde', 1347, 1680, 'CHN-XJ'],
  rinpungpa: ['Tibet (Rinpungpa)', 'tibetoburman', 'kingdom', 1435, 1565, 'CHN-TB'],
  joseon: ['Joseon', 'koreanic', 'kingdom', 1392, 1897, 'KOR'],
  bengal: ['Bengal Sultanate', 'indoaryan', 'kingdom', 1352, 1576, 'BGD'],
  vijayanagara: ['Vijayanagara Empire', 'dravidian', 'empire', 1336, 1646, 'IND-S'],
  ayutthaya: ['Ayutthaya Kingdom', 'taikadai', 'kingdom', 1351, 1767, 'THA'],
  lanxang: ['Lan Xang', 'taikadai', 'kingdom', 1353, 1707, 'LAO'],
  malacca: ['Malacca Sultanate', 'austronesian', 'kingdom', 1400, 1511, 'MYS'],
  majapahit: ['Majapahit', 'austronesian', 'empire', 1293, 1527, 'IDN-JV'],
  songhai: ['Songhai Empire', 'nilosaharan', 'empire', 1464, 1591, 'MLI'],
  adal: ['Adal Sultanate', 'horn', 'kingdom', 1415, 1577, 'SOM'],
  kongo: ['Kingdom of Kongo', 'bantu', 'kingdom', 1390, 1914, 'AGO'],
  mutapa: ['Mutapa Empire', 'bantu', 'empire', 1430, 1760, 'ZWE'],
  funj: ['Funj Sultanate', 'nilosaharan', 'kingdom', 1504, 1821, 'SDN'],
  aztec: ['Aztec Empire', 'mesoamerican', 'empire', 1428, 1521, 'MEX-C'],
  inca: ['Inca Empire', 'andean', 'empire', 1438, 1533, 'PER'],
  haudenosaunee: ['Haudenosaunee Confederacy', 'amerind_n', 'league', 1450, 1800, 'USA-NE'],
  afsharid: ['Afsharid Persia', 'iranian', 'empire', 1736, 1796, 'IRN'],
  durrani: ['Durrani Empire', 'iranian', 'empire', 1747, 1826, 'AFG'],
  khiva: ['Khanate of Khiva', 'turkic', 'kingdom', 1511, 1920, 'TKM'],
  kokand: ['Khanate of Kokand', 'turkic', 'kingdom', 1709, 1876, 'KGZ'],
  dzungar: ['Dzungar Khanate', 'mongolic', 'horde', 1634, 1758, 'CHN-XJ'],
  qing: ['Qing dynasty', 'tungusic', 'empire', 1644, 1912, 'CHN-N'],
  mughal: ['Mughal Empire', 'indoaryan', 'empire', 1526, 1857, 'IND-N'],
  maratha: ['Maratha Confederacy', 'indoaryan', 'league', 1674, 1818, 'IND-S'],
  bengalnawab: ['Nawabs of Bengal', 'indoaryan', 'kingdom', 1717, 1757, 'BGD'],
  kandy: ['Kingdom of Kandy', 'indoaryan', 'kingdom', 1469, 1815, 'LKA'],
  diriyah: ['Emirate of Diriyah', 'arabic', 'kingdom', 1744, 1818, 'SAU'],
  johor: ['Johor Sultanate', 'austronesian', 'kingdom', 1528, 1948, 'MYS'],
  aceh: ['Aceh Sultanate', 'austronesian', 'kingdom', 1496, 1903, 'IDN-W'],
  oyo: ['Oyo Empire', 'westafrican', 'empire', 1600, 1836, 'NGA'],
  dahomey: ['Kingdom of Dahomey', 'westafrican', 'kingdom', 1600, 1904, 'BEN'],
  ashanti: ['Ashanti Empire', 'westafrican', 'empire', 1701, 1901, 'GHA'],
  segou: ['Bambara Empire (Ségou)', 'westafrican', 'kingdom', 1712, 1861, 'MLI'],
  futajallon: ['Imamate of Futa Jallon', 'westafrican', 'theocracy', 1725, 1896, 'GIN'],
  luba: ['Luba–Lunda kingdoms', 'bantu', 'kingdom', 1585, 1889, 'COD'],
  rozvi: ['Rozvi Empire', 'bantu', 'empire', 1660, 1866, 'ZWE'],
  buganda: ['Kingdom of Buganda', 'bantu', 'kingdom', 1300, 1894, 'UGA'],
  merina: ['Merina Kingdom', 'austronesian', 'kingdom', 1540, 1897, 'MDG'],
  rwanda: ['Kingdom of Rwanda', 'bantu', 'kingdom', 1400, 1961, 'RWA'],
  // predecessors that become modern countries
  'c:FRA': [null, 'latin', 'kingdom', 843, null, 'FRA'],
  'c:GBR': [null, 'germanic', 'kingdom', 927, null, 'GBR'],
  'c:ESP': [null, 'latin', 'kingdom', 1479, null, 'ESP'],
  'c:PRT': [null, 'latin', 'kingdom', 1139, null, 'PRT'],
  'c:POL': [null, 'slavic', 'kingdom', 966, null, 'POL'],
  'c:HUN': [null, 'uralic', 'kingdom', 1000, null, 'HUN'],
  'c:LTU': [null, 'baltic', 'kingdom', 1236, null, 'LTU'],
  'c:DNK': [null, 'germanic', 'kingdom', 936, null, 'DNK'],
  'c:SWE': [null, 'germanic', 'kingdom', 970, null, 'SWE'],
  'c:NOR': [null, 'germanic', 'kingdom', 872, null, 'NOR'],
  'c:HRV': [null, 'slavic', 'kingdom', 925, null, 'HRV'],
  'c:GEO': [null, 'caucasian', 'kingdom', 1008, null, 'GEO'],
  'c:ARM': [null, 'caucasian', 'kingdom', 885, null, 'ARM'],
  'c:SRB': [null, 'slavic', 'kingdom', 1166, null, 'SRB'],
  'c:RUS': [null, 'slavic', 'kingdom', 1283, null, 'RUS-NW'],
  'c:JPN': [null, 'japonic', 'kingdom', 250, null, 'JPN'],
  'c:VNM': [null, 'austroasiatic', 'kingdom', 968, null, 'VNM'],
  'c:KHM': [null, 'austroasiatic', 'kingdom', 1431, null, 'KHM'],
  'c:MMR': [null, 'tibetoburman', 'kingdom', 1364, null, 'MMR'],
  'c:ETH': [null, 'horn', 'kingdom', 1137, null, 'ETH'],
  'c:MAR': [null, 'berber', 'kingdom', 788, null, 'MAR'],
  'c:OMN': [null, 'arabic', 'kingdom', 751, null, 'OMN'],
  'c:YEM': [null, 'arabic', 'theocracy', 897, null, 'YEM'],
  'c:CHE': [null, 'germanic', 'league', 1291, null, 'CHE'],
  'c:NLD': [null, 'germanic', 'republic', 1581, null, 'NLD'],
  'c:BRN': [null, 'austronesian', 'kingdom', 1368, null, 'BRN'],
};

// Snapshot year -> "polity[=name for this snapshot]: provinces; ..."
export const EARTH_SNAPSHOTS = {
  0: `rome: ITA ESP PRT FRA BEL CHE NLD AUT SVN HRV BIH MNE SRB ALB MKD KOS GRC TUR SYR LBN ISR PSE EGY LBY TUN CYP;
    mauretania: MAR DZA; parthia: IRN IRQ TKM; armenia: ARM AZE; kartli: GEO; nabataea: JOR; himyar: YEM;
    kush: SDN; dacia: ROU BGR MDA; marcomanni: CZE SVK; sarmatians: RUS-S KAZ-W UKR;
    kangju: UZB; wusun: KGZ KAZ-E; kushan: AFG TJK; indoscyth: PAK IND-N; satavahana: IND-S;
    magadha: IND-E; anuradhapura: LKA; han: CHN-N CHN-S CHN-SW VNM; xiongnu: MNG CHN-IM CHN-XJ;
    goguryeo: PRK CHN-NE; silla: KOR; maya: GTM BLZ MEX-Y HND; teotihuacan: MEX-C; moche: PER`,
  250: `rome: ITA ESP PRT FRA BEL CHE NLD LUX AUT SVN HRV BIH MNE SRB ALB MKD KOS GRC BGR ROU TUR SYR LBN ISR PSE JOR EGY LBY TUN DZA MAR CYP GBR HUN;
    sasanian: IRN IRQ TKM AFG AZE; armenia: ARM; kartli: GEO; himyar: YEM; aksum: ETH ERI; kush: SDN;
    sarmatians: RUS-S UKR KAZ-W; kushan: PAK IND-N TJK UZB; vakataka: IND-S; anuradhapura: LKA;
    wei: CHN-N CHN-NE; shu: CHN-SW; wu: CHN-S VNM; xianbei: MNG CHN-IM KAZ-E; goguryeo: PRK;
    silla: KOR; c:JPN=Yamatai: JPN; funan: KHM THA; maya: GTM BLZ MEX-Y HND SLV; teotihuacan: MEX-C;
    moche: PER; tiwanaku: BOL`,
  500: `byz: GRC TUR BGR MKD ALB SRB KOS EGY ISR PSE JOR LBN SYR CYP; ostrogoths: ITA SVN HRV AUT BIH;
    visigoths: ESP PRT; francia: FRA BEL NLD LUX; vandals: TUN LBY; mauroroman: DZA;
    sasanian: IRN IRQ AZE ARM GEO TKM; hephthalites: AFG TJK UZB PAK KGZ; gupta: IND-E BGD IND-N;
    pallava: IND-S; anuradhapura: LKA; nwei: CHN-N CHN-IM; sqi: CHN-S CHN-SW; rouran: MNG CHN-XJ KAZ-E;
    goguryeo: PRK CHN-NE; silla: KOR; c:JPN=Yamato: JPN; champa: VNM; funan: KHM THA;
    tarumanagara: IDN-JV; aksum: ETH ERI YEM; makuria: SDN; ghana: MRT MLI;
    maya: GTM BLZ MEX-Y HND; teotihuacan: MEX-C; moche: PER; tiwanaku: BOL`,
  750: `abbasid: IRQ IRN SYR LBN ISR PSE JOR EGY LBY TUN SAU YEM OMN ARE QAT KWT AFG TKM UZB TJK PAK AZE ARM;
    cordoba: ESP PRT; byz: TUR GRC CYP ALB; francia: FRA BEL NLD LUX DEU CHE AUT; lombards: ITA SVN;
    mercia: GBR; bulgaria1: BGR ROU MKD; avars: HUN SVK HRV SRB; khazars: RUS-S UKR KAZ-W;
    karluks: KGZ KAZ-E; uyghur: MNG CHN-IM; tang: CHN-N CHN-S CHN-XJ VNM; tibet: CHN-TB NPL;
    nanzhao: CHN-SW; balhae: CHN-NE PRK; silla: KOR; c:JPN=Nara Japan: JPN; srivijaya: IDN-W MYS;
    medang: IDN-JV; chenla: KHM LAO; dvaravati: THA; pyu: MMR; pala: IND-E BGD; rashtrakuta: IND-S;
    pratihara: IND-N; anuradhapura: LKA; aksum: ETH ERI; makuria: SDN; ghana: MRT MLI;
    maya: GTM BLZ MEX-Y HND; wari: PER; tiwanaku: BOL`,
  1000: `hre: DEU AUT CZE ITA CHE NLD LUX SVN; c:FRA=Kingdom of France: FRA BEL; c:GBR=Kingdom of England: GBR;
    cordoba=Caliphate of Córdoba: ESP PRT; c:POL=Kingdom of Poland: POL; c:HUN=Kingdom of Hungary: HUN SVK;
    c:HRV=Kingdom of Croatia: HRV BIH; kievan: UKR BLR RUS-NW; volgabulgaria: RUS-V;
    byz: TUR GRC CYP ALB SRB; bulgaria1: BGR MKD; c:DNK=Kingdom of Denmark: DNK NOR; c:SWE=Sweden: SWE;
    c:GEO=Kingdom of Georgia: GEO; c:ARM=Bagratid Armenia: ARM;
    fatimid: EGY LBY ISR PSE LBN SYR JOR; zirid: TUN DZA; buyid: IRQ IRN; ghaznavid: AFG PAK TKM;
    karakhanid: UZB TJK KGZ KAZ-E CHN-XJ; pechenegs: RUS-S KAZ-W;
    song: CHN-N CHN-S CHN-SW; liao: CHN-NE CHN-IM MNG; goryeo: KOR PRK; c:JPN=Heian Japan: JPN;
    c:VNM=Đại Cồ Việt: VNM; khmer: KHM THA LAO; pagan: MMR; srivijaya: IDN-W MYS; medang: IDN-JV;
    chola: IND-S LKA; pala: IND-E BGD; pratihara: IND-N; ghana: MRT MLI; kanem: TCD;
    makuria: SDN; toltec: MEX-C; maya: MEX-Y GTM BLZ; chimu: PER; tiwanaku: BOL; mississippian: USA-C`,
  1250: `mongol: MNG CHN-N CHN-IM CHN-NE CHN-XJ CHN-TB KAZ-E KAZ-W KGZ UZB TJK TKM AFG IRN GEO AZE ARM RUS-S RUS-V UKR;
    song=Southern Song: CHN-S; dali: CHN-SW; goryeo: KOR PRK; c:JPN=Kamakura Shogunate: JPN;
    abbasid: IRQ; mamluk: EGY SYR LBN ISR PSE JOR; rum: TUR; nicaea: GRC; bulgaria2: BGR MKD;
    c:SRB=Kingdom of Serbia: SRB MNE; hafsid: TUN LBY; zayyanid: DZA; almohad: MAR;
    c:ESP=Crown of Castile: ESP; c:PRT=Kingdom of Portugal: PRT; c:FRA=Kingdom of France: FRA;
    c:GBR=Kingdom of England: GBR IRL; hre: DEU AUT CZE ITA CHE NLD BEL LUX SVN;
    c:HUN=Kingdom of Hungary: HUN SVK HRV ROU BIH; c:POL=Kingdom of Poland: POL;
    c:LTU=Grand Duchy of Lithuania: LTU BLR; teutonic: LVA EST; vladimir: RUS-NW;
    c:DNK=Kingdom of Denmark: DNK; c:SWE=Kingdom of Sweden: SWE FIN; c:NOR=Kingdom of Norway: NOR ISL;
    delhi: IND-N PAK IND-E BGD; pandya: IND-S; anuradhapura=Dambadeniya: LKA;
    c:VNM=Đại Việt: VNM; khmer: KHM LAO; sukhothai: THA; pagan: MMR; srivijaya: IDN-W MYS;
    singhasari: IDN-JV; c:ETH=Zagwe Kingdom: ETH ERI; makuria: SDN; kanem: TCD NER; mali: MLI GIN SEN GMB;
    benin: NGA; kilwa: TZA; zimbabwe: ZWE; mayapan: MEX-Y; chimu: PER; mississippian: USA-C`,
  1500: `ottoman: TUR GRC BGR SRB MKD ALB KOS BIH MNE ROU MDA; mamluk: EGY SYR LBN ISR PSE JOR;
    safavid: IRN AZE ARM; bukhara=Shaybanid Khanate: UZB TJK TKM; timurids: AFG; kazakh: KAZ-E KAZ-W;
    nogai: RUS-S; kazan: RUS-V; sibir: RUS-WS; c:RUS=Grand Duchy of Moscow: RUS-NW;
    c:POL=Poland–Lithuania: POL LTU BLR UKR; c:HUN=Kingdom of Hungary: HUN SVK HRV;
    hre: DEU AUT CZE NLD BEL LUX SVN; c:CHE=Swiss Confederacy: CHE; italy_states: ITA;
    c:FRA=Kingdom of France: FRA; c:GBR=Kingdom of England: GBR IRL; c:ESP=Crowns of Castile and Aragon: ESP DOM HTI;
    c:PRT=Kingdom of Portugal: PRT; kalmar: DNK NOR SWE FIN ISL; teutonic=Livonian Confederation: LVA EST;
    c:GEO=Kingdom of Georgia: GEO; hafsid: TUN LBY; zayyanid: DZA; c:MAR=Wattasid Morocco: MAR;
    ming: CHN-N CHN-S CHN-SW; nyuan: MNG CHN-IM; moghulistan: CHN-XJ KGZ; rinpungpa: CHN-TB;
    joseon: KOR PRK; c:JPN=Ashikaga Japan (Sengoku): JPN; delhi=Delhi Sultanate (Lodi): IND-N PAK;
    bengal: BGD IND-E; vijayanagara: IND-S; kandy: LKA; c:VNM=Đại Việt (Lê): VNM; ayutthaya: THA;
    lanxang: LAO; c:KHM=Kingdom of Cambodia: KHM; c:MMR=Kingdom of Ava: MMR; malacca: MYS;
    majapahit: IDN-JV; c:BRN=Bruneian Empire: BRN IDN-K; aceh: IDN-W; songhai: MLI NER; mali: GIN SEN GMB;
    kanem=Bornu Empire: TCD; benin: NGA; c:ETH=Ethiopian Empire: ETH ERI; adal: SOM DJI SOL;
    funj: SDN; kongo: AGO COG; mutapa: ZWE MOZ; kilwa: TZA; buganda: UGA; c:OMN=Imamate of Oman: OMN;
    aztec: MEX-C; maya: MEX-Y GTM; inca: PER ECU BOL CHL ARG-N; haudenosaunee: USA-NE`,
  1750: `c:GBR=Great Britain: GBR IRL USA-NE USA-SE JAM BHS CAN-C; c:FRA=Kingdom of France: FRA FRA-GF CAN-E USA-C HTI;
    c:ESP=Spanish Empire: ESP MEX-N MEX-C MEX-Y GTM BLZ HND SLV NIC CRI PAN CUB DOM PRI COL VEN ECU PER BOL CHL ARG-N PRY URY PHL USA-W;
    c:PRT=Portuguese Empire: PRT BRA-N BRA-SE BRA-W AGO MOZ; c:NLD=Dutch Republic: NLD IDN-JV SUR GUY ZAF;
    habsburg: AUT HUN CZE SVK HRV SVN BEL LUX; hre=Holy Roman Empire (German states): DEU;
    c:CHE=Swiss Confederacy: CHE; italy_states: ITA; c:POL=Polish–Lithuanian Commonwealth: POL LTU BLR UKR;
    c:RUS=Russian Empire: RUS-NW RUS-V RUS-S RUS-WS RUS-CS RUS-FE EST LVA; c:SWE=Sweden: SWE FIN;
    c:DNK=Denmark–Norway: DNK NOR ISL GRL FRO;
    ottoman: TUR GRC BGR SRB MKD ALB KOS BIH MNE ROU MDA EGY LBY TUN DZA SYR LBN ISR PSE JOR IRQ CYP KWT;
    afsharid: IRN AZE ARM GEO; durrani: AFG PAK; bukhara: UZB TJK; khiva: TKM; kokand: KGZ;
    kazakh: KAZ-E KAZ-W; dzungar: CHN-XJ; qing: CHN-N CHN-S CHN-SW CHN-NE CHN-IM CHN-TB MNG TWN;
    joseon: KOR PRK; c:JPN=Tokugawa Shogunate: JPN; c:VNM=Đại Việt (Lê–Trịnh): VNM; ayutthaya: THA;
    lanxang=Lao kingdoms: LAO; c:KHM=Kingdom of Cambodia: KHM; c:MMR=Konbaung Burma: MMR; johor: MYS;
    aceh: IDN-W; mughal: IND-N; maratha: IND-S; bengalnawab: IND-E BGD; kandy: LKA;
    diriyah: SAU; c:YEM=Zaydi Imamate: YEM; c:OMN=Oman: OMN; c:MAR=Alaouite Morocco: MAR MRT;
    c:ETH=Ethiopian Empire: ETH ERI; funj: SDN; kanem=Bornu Empire: TCD NER; oyo: NGA; dahomey: BEN;
    ashanti: GHA; segou: MLI; futajallon: GIN; luba: COD; kongo: COG; rozvi: ZWE; buganda: UGA;
    rwanda: RWA; merina: MDG`,
};

export const EU_MEMBERS = 'AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE';

export const EARTH_EVENTS = [
  [9, 'The Battle of the Teutoburg Forest fixes the Rhine as Rome\'s northern frontier.'],
  [30, 'The Yuezhi clans unite as the Kushan Empire, straddling the Silk Road.'],
  [117, 'The Roman Empire reaches its greatest extent under Trajan.'],
  [184, 'The Yellow Turban rebellion begins the unravelling of the Han.'],
  [220, 'The Han dynasty falls; China splits into the Three Kingdoms.'],
  [224, 'Ardashir I overthrows the Parthians and founds the Sasanian Empire.'],
  [320, 'Chandragupta I founds the Gupta Empire in Magadha.'],
  [330, 'Constantinople becomes the new capital of the Roman Empire.'],
  [376, 'Goths cross the Danube, fleeing the Huns: the Migration Period begins.'],
  [476, 'The last Western Roman emperor is deposed.'],
  [541, 'The Plague of Justinian sweeps the Mediterranean.'],
  [618, 'The Tang dynasty is founded.'],
  [632, 'The early Islamic conquests begin from Arabia.'],
  [750, 'The Abbasid Revolution moves the caliphate\'s centre to Iraq.'],
  [800, 'Charlemagne is crowned emperor in Rome.'],
  [868, 'The Diamond Sutra is printed in China.'],
  [960, 'The Song dynasty reunifies most of China.'],
  [1000, 'Norse voyagers reach Vinland, a brief first crossing of the Atlantic.'],
  [1066, 'The Norman conquest of England.'],
  [1096, 'The First Crusade.'],
  [1206, 'Temüjin is proclaimed Genghis Khan.'],
  [1258, 'The Mongols sack Baghdad.'],
  [1279, 'The Yuan dynasty completes the conquest of China.'],
  [1347, 'The Black Death reaches Europe.'],
  [1368, 'The Ming dynasty expels the Yuan.'],
  [1405, 'Zheng He\'s treasure fleets sail the Indian Ocean.'],
  [1453, 'Constantinople falls to the Ottomans.'],
  [1492, 'Columbus reaches the Caribbean: Afro-Eurasia and the Americas are joined.'],
  [1521, 'Tenochtitlan falls to Cortés and his allies.'],
  [1526, 'Babur founds the Mughal Empire.'],
  [1644, 'The Qing dynasty takes Beijing.'],
  [1687, 'Newton publishes the Principia.'],
  [1776, 'The United States declares independence.'],
  [1789, 'The French Revolution.'],
  [1800, 'The Industrial Revolution gathers pace in Britain.'],
  [1820, 'Latin American wars of independence end Spanish rule on the mainland.'],
  [1884, 'The Berlin Conference opens the Scramble for Africa.'],
  [1914, 'The First World War.'],
  [1939, 'The Second World War.'],
  [1945, 'The United Nations is founded; decolonisation begins in earnest.'],
  [1949, 'The People\'s Republic of China is proclaimed.'],
  [1969, 'Humans walk on the Moon.'],
  [1991, 'The Soviet Union dissolves.'],
  [1993, 'The Maastricht Treaty creates the European Union.'],
  [2000, 'The United States, the European Union and China stand as the leading powers of the Terran region — one regional system among many on Big Earth.'],
];

export function earthCultureAt(code, year) {
  const h = CULTURE_HISTORY[code];
  if (h) {
    let c = h[0][1];
    for (const [y, cc] of h) if (year >= y) c = cc;
    return c;
  }
  for (const [c, list] of Object.entries(MODERN_CULTURE)) {
    if (list.split(' ').includes(code)) return c === 'null' ? null : c;
  }
  return undefined;
}

export function earthTechAt(code, year, income) {
  const idx = (year / 250) | 0;
  if (year >= 2000) return TECH_2000_BY_INCOME[income] ?? 8;
  if (year === 1750 && TECH_1750[code] !== undefined) return TECH_1750[code];
  for (const [vals, list] of Object.values(AREAS)) {
    if (list.split(' ').includes(code)) return vals[idx];
  }
  return undefined;
}

export const EARTH_TECH_AREAS = AREAS;
export const EARTH_MODERN_CULTURE = MODERN_CULTURE;
