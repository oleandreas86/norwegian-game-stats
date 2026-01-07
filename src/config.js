module.exports = {
  games: [
    // Funcom (+ related studios / publishing where relevant)
    { id: 440900, name: "Conan Exiles", developer: "Funcom" },
    { id: 215280, name: "Secret World Legends", developer: "Funcom" },
    { id: 6310, name: "The Longest Journey", developer: "Funcom" },
    { id: 6300, name: "Dreamfall: The Longest Journey", developer: "Funcom" },
    { id: 237850, name: "Dreamfall Chapters", developer: "Red Thread Games" },
    { id: 591970, name: "Draugen", developer: "Red Thread Games" },
    { id: 1012840, name: "Moons of Madness", developer: "Rock Pocket Games" },
    { id: 760060, name: "Mutant Year Zero: Road to Eden", developer: "The Bearded Ladies (Funcom)" },
    { id: 1172710, name: "Dune: Awakening", developer: "Funcom" },

    // Misc Games
    { id: 1264250, name: "Fishing: North Atlantic", developer: "Misc Games" },
    { id: 501080, name: "Fishing: Barents Sea", developer: "Misc Games" },

    // Krillbite Studio
    { id: 250620, name: "Among the Sleep - Enhanced Edition", developer: "Krillbite Studio" },
    { id: 332210, name: "Among the Sleep: Prologue", developer: "Krillbite Studio" },
    { id: 250600, name: "The Plan", developer: "Krillbite Studio" },
    { id: 349270, name: "Mosaic", developer: "Krillbite Studio" },
    { id: 1451120, name: "Sunlight", developer: "Krillbite Studio" },
    { id: 2484130, name: "Fruitbus", developer: "Krillbite Studio" },

    // Rain Games
    { id: 249590, name: "Teslagrad", developer: "Rain Games" },
    { id: 2168150, name: "Teslagrad Remastered", developer: "Rain Games" },
    { id: 1698220, name: "Teslagrad 2", developer: "Rain Games" },
    { id: 530020, name: "World to the West", developer: "Rain Games" },
    { id: 646800, name: "World to the West - A Motorland Tale Comic Book", developer: "Rain Games" },
    { id: 1308760, name: "Mesmer", developer: "Rain Games" },
    { id: 3199470, name: "Knuckle Jet", developer: "Rain Games" },

    // D-Pad Studio
    { id: 115800, name: "Owlboy", developer: "D-Pad Studio" },
    { id: 259530, name: "Savant - Ascent", developer: "D-Pad Studio" },
    { id: 2279330, name: "Savant - Ascent REMIX", developer: "D-Pad Studio" },
    { id: 748810, name: "Vikings On Trampolines", developer: "D-Pad Studio" },

    // Snowcastle Games
    { id: 761030, name: "EARTHLOCK", developer: "Snowcastle Games" },
    { id: 1550730, name: "Ikonei Island: An Earthlock Adventure", developer: "Snowcastle Games" },

    // Rock Pocket Games
    { id: 1299290, name: "Somber Echoes", developer: "Rock Pocket Games" },

    // Ravn Studio / Rock Pocket Games (co-dev credits on Steam)
    { id: 1383970, name: "Captain Sabertooth and the Magic Diamond", developer: "Ravn Studio, Rock Pocket Games" },
    { id: 1668080, name: "Pinchcliffe Grand Prix", developer: "Ravn Studio" },
    { id: 3352670, name: "Pinchcliffe Grand Prix Anniversary Edition", developer: "Ravn Studio" },
    { id: 3607210, name: "Pinchcliffe Grand Prix Mini games", developer: "Ravn Studio" },

    // Snow Cannon Games (Norwegian publisher) + Norwegian-made titles in their catalogue
    { id: 513890, name: "The Frostrune", developer: "Grimnir Media" },
    { id: 412660, name: "Klang", developer: "Tinimations" },
    { id: 316480, name: "Shadow Puppeteer", developer: "Sarepta Studio" },

    // Megapop
    { id: 979800, name: "Haxity", developer: "Megapop" },
    { id: 1655670, name: "Rob Riches", developer: "Megapop" },
    { id: 2940040, name: "Trolls vs Vikings: Reborn", developer: "Megapop" },
    { id: 2932150, name: "Life Below", developer: "Megapop" },

    // Antagonist
    { id: 368430, name: "Through the Woods", developer: "Antagonist" },

    // Hyper Games
    { id: 1331910, name: "Morkredd", developer: "Hyper Games" },

    // Solo / micro-studio (Norway)
    { id: 544970, name: "Milkmaid of the Milky Way", developer: "Mattis Folkestad (machineboy)" },

    // Vedinad
    { id: 3405340, name: "Megabonk", developer: "Vedinad" },
  ],
  databasePath: "./src/data/stats.db",
  collectionInterval: "*/10 * * * *" // Every 10 minutes
};
