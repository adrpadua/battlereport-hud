/**
 * Manual phonetic overrides for W40K terms that YouTube commonly mishears.
 * Maps canonical term -> array of phonetic variations that YouTube might produce.
 *
 * These overrides take priority over algorithmic phonetic matching because
 * YouTube's speech recognition produces consistent patterns for these terms.
 */
export const PHONETIC_OVERRIDES: Record<string, string[]> = {
  // === Space Marines / Imperium Characters ===
  'Guilliman': [
    'gilman',
    'gillman',
    'gillein',
    'gilaman',
    'gullan',
    'gullman',
    'guilleman',
    'gillaman',
    'gully man',
    'gully men',
  ],
  'Roboute Guilliman': [
    'row booty guilliman',
    'row boot guilliman',
    'roboute gilman',
    'roboute gillman',
  ],
  'Tigurius': [
    'tigerius',
    'toarius',
    'tigarius',
    'tie garius',
    'tie gurius',
    'tig urius',
  ],
  'Sicarius': [
    'sakarius',
    'ko sakarius',
    'coe sakarius',
    'si carius',
    'sic arius',
    'korsakarius',
    'kosakarius',
  ],
  'Cato Sicarius': [
    'cato sicarius',
    'cato sakarius',
  ],
  'Helbrecht': [
    'hellbreck',
    'hellbreick',
    'hell breck',
    'hell brecht',
    'hel brecht',
    'hell brick',
  ],
  'Chaplain Grimaldus': [
    'grimaldis',
    'grim aldus',
    'grim all dis',
    'grim oldus',
  ],
  'The Emperor\'s Champion': [
    'emperor champion',
    'emperors champion',
    'emperor\'s champion',
  ],

  // === Space Marine Units ===
  'Redemptor Dreadnought': [
    'redemptor dreadnot',
    'redemptor dread not',
    'redemption dreadnought',
    'red emptor dreadnought',
  ],
  'Brutalis Dreadnought': [
    'brutalis dreadnot',
    'brutalis dread not',
    'brutal is dreadnought',
    'brew talus dreadnought',
  ],
  'Ballistus Dreadnought': [
    'ballistus dreadnot',
    'ballistas dreadnought',
    'ball istus dreadnought',
  ],
  'Contemptor Dreadnought': [
    'contemptor dreadnot',
    'contempt or dreadnought',
  ],
  'Venerable Dreadnought': [
    'venerable dreadnot',
    'venn erable dreadnought',
  ],
  'Sternguard Veterans': [
    'stern guard veterans',
    'stern guard vets',
    'sternguard vets',
    'stern guard',
  ],
  'Vanguard Veterans': [
    'vanguard vets',
    'van guard veterans',
    'van guard vets',
  ],
  'Assault Terminators': [
    'assault term in ators',
    'a salt terminators',
  ],
  'Terminator Squad': [
    'terminator squad',
    'term in ator squad',
  ],
  'Victrix Honour Guard': [
    'victrix honor guard',
    'victor\'s honor guard',
    'victrix guard',
    'vic tricks honor guard',
    'vic trix honour guard',
  ],
  'Repulsor Executioner': [
    'repulser executioner',
    'repulsor executor',
    'repulse or executioner',
  ],
  'Crusader Squad': [
    'crusader squad',
    'crew sader squad',
  ],
  'Sword Brethren': [
    'sword brethren',
    'sword breath ren',
    'sword brother in',
  ],

  // === Faction Names ===
  'Necrons': [
    'neck runs',
    'necro arms',
    'neck rons',
    'necro ns',
    'neck runs',
    'neck ron',
    'necro on',
    'necro ons',
  ],
  'Drukhari': [
    'drew car ee',
    'drug harry',
    'dru kari',
    'drew kari',
    'drew carry',
    'drug carry',
    'drook ari',
    'droo kari',
    'droo carry',
  ],
  'Aeldari': [
    'el dari',
    'elder eye',
    'all dary',
    'el dary',
    'all dari',
    'elder i',
    'al dari',
    'ale dari',
  ],
  "T'au Empire": [
    'tau empire',
    'tao empire',
    'towel empire',
    'tow empire',
  ],
  "T'au": [
    'tau',
    'tao',
    'towel',
    'tow',
  ],
  'Adeptus Custodes': [
    'a depth us custodies',
    'adept us custodies',
    'adept us cuss toad es',
  ],
  'Adeptus Mechanicus': [
    'a depth us mechanicus',
    'adept us mechanicus',
    'adept us mech anicus',
  ],
  'Adepta Sororitas': [
    'a depth a sororitas',
    'adept a sore or itas',
    'a depth a sor or itas',
  ],
  'Tyranids': [
    'tie ran ids',
    'tier anids',
    'tyrann ids',
    'tie rannids',
  ],
  'Genestealer Cults': [
    'jean steeler cults',
    'gene steeler cults',
    'jeans teeler cults',
  ],
  'Leagues of Votann': [
    'leagues of vote ann',
    'leagues of vo tan',
    'leagues of vo tann',
  ],

  // === Character Names ===
  'Lelith Hesperax': [
    'lilith hesperax',
    'lil lith hesperax',
    'lay lith hesperax',
    'le lith hes per ax',
  ],
  'Drazhar': [
    'drazar',
    'draz har',
    'drash ar',
    'drash har',
  ],
  'Urien Rakarth': [
    'urine rakarth',
    'urine rack arth',
    'you ren rakarth',
  ],
  'Haemonculus': [
    'hemo uncle us',
    'hemo on cue lus',
    'hee mon cue lus',
    'he monk you lus',
  ],
  'Archon': [
    'arc on',
    'are con',
    'arc con',
  ],
  'Succubus': [
    'suck you bus',
    'suck a bus',
    'sue cubus',
  ],
  'Farseer': [
    'far seer',
    'far see er',
    'far sear',
  ],
  'Autarch': [
    'auto arc',
    'aw tark',
    'aw tarch',
    'auto arch',
  ],
  'Warlock': [
    'war lock',
    'wore lock',
  ],
  'Avatar of Khaine': [
    'avatar of cane',
    'avatar of kane',
    'avatar of chain',
  ],
  'Yncarne': [
    'in car nay',
    'in carne',
    'ink arne',
    'yin carne',
  ],
  'Yvraine': [
    'ee vrain',
    'eve rain',
    'e vrain',
  ],
  'Cryptek': [
    'crypt ek',
    'crypt tech',
    'crip tech',
  ],
  'Overlord': [
    'over lord',
  ],
  'C\'tan': [
    'sea tan',
    'see tan',
    'kuh tan',
    'stan',
  ],
  'Szarekh': [
    'zara eck',
    'sah reck',
    'zah wreck',
  ],
  'Imotekh': [
    'im oh tech',
    'ee mo tech',
    'i moe tech',
  ],

  // === Unit Names ===
  'Kabalite Warriors': [
    'cabal ite warriors',
    'cab elite warriors',
    'cabalite warriors',
    'cable ite warriors',
  ],
  'Wyches': [
    'witches',
    'which is',
    'why chez',
  ],
  'Incubi': [
    'in cube eye',
    'ink you bye',
    'in cue by',
  ],
  'Mandrakes': [
    'man drakes',
    'man drakes',
    'manned rakes',
  ],
  'Scourges': [
    'scores',
    'scour ges',
  ],
  'Grotesques': [
    'grow tesks',
    'grow tests',
    'gro tesks',
  ],
  'Wracks': [
    'rax',
    'racks',
    'wrax',
    'wrecks',
    'rex',
    'rack',
    'wrac',
  ],
  'Talos': [
    'tail os',
    'tall os',
    'tay los',
  ],
  'Cronos': [
    'crow nos',
    'kronos',
    'crone os',
  ],
  'Ravager': [
    'rav a ger',
    'rave ager',
  ],
  'Voidraven': [
    'void raven',
    'void ray ven',
  ],
  'Razorwing': [
    'razor wing',
    'razer wing',
  ],
  'Reaver': [
    'reever',
    'reev er',
    'ree ver',
  ],
  'Hellions': [
    'helly ons',
    'hell ions',
    'helli ons',
  ],
  'Wraithguard': [
    'wraith guard',
    'rave guard',
    'ray guard',
  ],
  'Wraithblades': [
    'wraith blades',
    'rave blades',
    'ray blades',
  ],
  'Wraithknight': [
    'wraith knight',
    'rave knight',
    'ray knight',
  ],
  'Wraithseer': [
    'wraith seer',
    'rave seer',
    'ray seer',
  ],
  'Wave Serpent': [
    'wave serpent',
    'waive serpent',
  ],
  'Fire Prism': [
    'fire prism',
    'fire prison',
  ],
  'Night Spinner': [
    'night spinner',
    'knight spinner',
  ],
  'Hemlock Wraithfighter': [
    'hemlock wraith fighter',
    'hemlock rave fighter',
  ],
  'Crimson Hunter': [
    'crimson hunter',
    'krimson hunter',
  ],
  'Dire Avengers': [
    'dire avengers',
    'dyer avengers',
  ],
  'Howling Banshees': [
    'howling ban shees',
    'howling banshees',
  ],
  'Striking Scorpions': [
    'striking scorpions',
    'striking scorp ions',
  ],
  'Fire Dragons': [
    'fire dragons',
    'firedragons',
  ],
  'Dark Reapers': [
    'dark reapers',
    'dark reepers',
  ],
  'Shining Spears': [
    'shining spears',
    'shinning spears',
  ],
  'Warp Spiders': [
    'warp spiders',
    'war spiders',
  ],
  'Swooping Hawks': [
    'swooping hawks',
    'swooping hocks',
  ],
  'Rangers': [
    'rain gers',
  ],
  'Windriders': [
    'wind riders',
    'win drivers',
  ],
  'Guardians': [
    'guard ians',
    'guard ee ans',
  ],
  'Intercessors': [
    'inter cessors',
    'inter sessors',
  ],
  'Terminators': [
    'term in ators',
    'terminator s',
  ],
  'Bladeguard Veterans': [
    'blade guard veterans',
    'blade guard vets',
  ],
  'Lychguard': [
    'lick guard',
    'litch guard',
    'lych guard',
    'like guard',
  ],
  'Immortals': [
    'imm ortals',
    'im mortals',
  ],
  'Deathmarks': [
    'death marks',
    'deaf marks',
  ],
  'Flayed Ones': [
    'flayed ones',
    'played ones',
    'frayed ones',
  ],
  'Ophydian Destroyers': [
    'oh fidian destroyers',
    'offidian destroyers',
    'o phidian destroyers',
  ],
  'Skorpekh Destroyers': [
    'score peck destroyers',
    'scor peck destroyers',
    'score pec destroyers',
  ],
  'Lokhust Destroyers': [
    'low cust destroyers',
    'lo cust destroyers',
    'locust destroyers',
  ],
  'Canoptek Wraiths': [
    'cane op tech wraiths',
    'can op tek wraiths',
    'canop tech wraiths',
  ],
  'Canoptek Scarabs': [
    'cane op tech scarabs',
    'can op tek scarabs',
    'canop tech scarabs',
  ],
  'Canoptek Spyders': [
    'cane op tech spiders',
    'can op tek spiders',
    'canop tech spiders',
  ],
  'Tesseract Vault': [
    'tesser act vault',
    'test erect vault',
    'tess eract vault',
  ],
  'Monolith': [
    'mono lith',
    'mano lith',
  ],
  'Doomsday Ark': [
    'dooms day arc',
    'doom stay ark',
  ],
  'Ghost Ark': [
    'ghost arc',
  ],
  'Night Scythe': [
    'night sigh',
    'knight scythe',
  ],
  'Doom Scythe': [
    'doom sigh',
    'doom scythe',
  ],

  // === Generic Unit Terms ===
  'Dreadnought': [
    'dreadnot',
    'dread not',
    'dread naught',
    'dred nought',
    'dread naut',
  ],
  'Primarch': [
    'prime ark',
    'pry mark',
    'prim ark',
  ],
  'Chapter Master': [
    'chapter master',
    'chapter mas ter',
  ],

  // === Black Templars ===
  'Wrathful Procession': [
    'wrathful procession',
    'wrath full procession',
    'wrathful pro session',
  ],
  'Righteous Crusaders': [
    'righteous crusaders',
    'right eous crusaders',
  ],

  // === Detachment Names ===
  'Realspace Raiders': [
    'real space raiders',
    'reel space raiders',
  ],
  'Skysplinter Assault': [
    'sky splinter assault',
    'sky splinter a salt',
  ],
  'Kabalite Cartel': [
    'cabalite cartel',
    'cab elite cartel',
    'cable ite cartel',
  ],
  'Hypercrypt Legion': [
    'hyper crypt legion',
    'hyper cripted legion',
  ],
  'Awakened Dynasty': [
    'a wakened dynasty',
    'awaken dynasty',
  ],
  'Canoptek Court': [
    'cane op tech court',
    'can op tek court',
  ],
  'Annihilation Legion': [
    'an i high lay shun legion',
    'a nile ation legion',
  ],

  // === Stratagem Names ===
  'Fire Overwatch': [
    'fire over watch',
    'fire over wach',
  ],
  'Heroic Intervention': [
    'heroic inter vention',
    'heroic intervention',
  ],
  'Insane Bravery': [
    'in sane bravery',
    'insane brave ry',
  ],
  'Rapid Ingress': [
    'rapid in gress',
    'rapid ingress',
  ],
  'Lightning-Fast Reactions': [
    'lightning fast reactions',
    'light ning fast reactions',
  ],
  'Fire and Fade': [
    'fire and fade',
    'fire in fade',
  ],
  'Forewarned': [
    'for warned',
    'four warned',
  ],
  'Phantasm': [
    'fan tasm',
    'phantom',
  ],
  'Strands of Fate': [
    'strands of fate',
    'strand of fate',
  ],
  'Battle Focus': [
    'battle focus',
    'battle focas',
  ],

  // === Objective Names ===
  'Assassination': [
    'a sass in ation',
    'assassin nation',
  ],
  'Bring It Down': [
    'bring it down',
  ],
  'No Prisoners': [
    'no prisoners',
    'know prisoners',
  ],
  'Behind Enemy Lines': [
    'behind enemy lines',
    'be hind enemy lines',
  ],
  'Engage on All Fronts': [
    'engage on all fronts',
    'in gage on all fronts',
  ],
  'Deploy Teleport Homers': [
    'deploy tele port homers',
    'deploy teleport home ers',
  ],
  'Storm Hostile Objective': [
    'storm hostile objective',
    'storm hostile object if',
  ],
};
