/**
 * Siege monsters: the things that crawl out of the screen for /siege, the
 * server-wide co-op attack. A monster appears in the games channel with an
 * HP bar; members hit it with `/siege attack weapon:food|doom|potion`; every
 * so often it grabs a fighter (someone else must /rescue them), poisons one
 * (someone else must cure them with a helpful /potion) or just roars. Kill
 * it in time and everyone who helped gets rewards.
 *
 * This file is the shared contract between the siege engine (which picks a
 * monster, runs the fight and applies the numbers below) and the cards that
 * announce it. It is data only — no logic lives here.
 *
 * SHAPE — every monster, keyed by `key` (the key is what the engine stores):
 *
 *   name, emoji      'The Blob', '🟢'
 *   weight           relative chance of being picked for a random siege
 *   months           null, or an array of UTC month numbers 1-12 it can
 *                    appear in (Headless Horseman: [10])
 *   hp               HP multiplier (1 = normal)
 *   minutes          null (server default) or a fixed length in minutes — at
 *                    quick pace only (2.74.0: any other pace runs its own length)
 *   damage           { food, doom, potion } — damage multiplier per weapon
 *                    (1 = normal)
 *   traits           only the ones that apply; every one is optional:
 *     missHeal       fraction of max HP healed whenever a food attack MISSES
 *                    (Gremlins: 0.02)
 *     actHeal        fraction of max HP healed each time the monster acts
 *                    (Wolfman: 0.015)
 *     silverMult     Silver Bullet damage multiplier instead of the usual 3
 *                    (Wolfman: 5)
 *     hitBonus       flat damage added to every damaging hit (THEM!: 2)
 *     poisonMult     multiplier on poison-over-time damage (The Count: 0.5)
 *     loot           loot chance multiplier (Atomic Lizard, Horseman: 2)
 *     grabCount      fighters grabbed per grab action (Killer Klowns: 2)
 *     grabTop        true: grabs go for the top contributor (The Thing)
 *     poisonOnly     true: never grabs, only poisons (Pod People)
 *     poisonCount    fighters poisoned per poison action (Pod People: 2)
 *     poisonForever  true: its poison never wears off by itself (Pod People)
 *     actWeights     { grab, poison, roar } percentages overriding the
 *                    default 50/35/15 (The Count: { grab: 55, poison: 30,
 *                    roar: 15 })
 *   about            one short line for the card: the trait in plain words
 *   lines            { arrive, defeat, escape, grab[3], poison[3], roar[3] }
 *     arrive         the monster shows up (posted as a NEW message — edits
 *                    never notify)
 *     defeat         contains {mvp}; the monster is beaten
 *     escape         time ran out and it got away
 *     grab           3 lines, {monster} and {fighter}; each tells people to
 *                    /rescue them. (Pod People never grab, but carry the
 *                    lines anyway so every monster has the same shape.)
 *     poison         3 lines, {monster} and {fighter}; each says a helpful
 *                    /potion cures them
 *     roar           3 lines, {monster}; flavour only
 *
 * PLACEHOLDERS — {mvp}, {monster} and {fighter} are filled by the engine
 * with DISPLAY NAMES, never mentions. The engine pings the people involved
 * separately (mentions inside the text of an embed never ping anyway), so
 * nothing here should try to. No other placeholder is allowed; the test
 * (tests/siege-monsters.test.js) enforces this, and a 200 character cap per
 * line so a card never runs into Discord's field limits.
 *
 * TONE — PG-13 horror-comedy in the drive-in's own voice: cartoon gore and
 * mild swearing are fine; nothing hateful, nothing sexual. Each monster
 * speaks as itself and nods to its own movie.
 */

export const MONSTERS = Object.freeze({
  blob: {
    name: 'The Blob', emoji: '🟢',
    weight: 10, months: null, hp: 1, minutes: null,
    damage: { food: 0.5, doom: 1.25, potion: 1 },
    traits: {},
    about: 'Pies just sink in: food fight does half damage, but dooms hit harder.',
    lines: {
      arrive: 'A pink ooze slides out from under the concession stand, absorbing a hot dog, a napkin dispenser and someone\'s flip-flop.',
      defeat: '{mvp} hits it with a fire extinguisher and The Blob freezes solid. Somebody ships it to the Arctic. That always works.',
      escape: 'The Blob oozes into the storm drain with three tubs of popcorn butter. It\'ll be back. It\'s always back.',
      grab: [
        '{monster} swallows {fighter} up to the neck. Visible inside: one phone, one shoe, a lot of regret. Somebody /rescue them!',
        '{monster} slurps {fighter} off their feet like gravy off a biscuit. They are waving from inside. Somebody /rescue them!',
        '{fighter} steps in something pink and now {fighter} is IN something pink. {monster} is very pleased. Somebody /rescue them!',
      ],
      poison: [
        '{monster} oozes acid on {fighter}, who is now fizzing like a dropped antacid. A helpful /potion will cure them!',
        '{fighter} gets slimed. It smells like old cherry cough syrup and it is eating their shirt. A helpful /potion will cure them!',
        '{monster} burps a toxic cloud at {fighter}, who turns the color of lime Jell-O. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} has no mouth, so it just ripples at you aggressively. It works.',
        '{monster} jiggles menacingly and eats a lawn chair. Nobody was sitting in it. Probably.',
        '{monster} burbles, slurps, and absorbs the ice machine. The ice does not survive.',
      ],
    },
  },

  gremlins: {
    name: 'Gremlins', emoji: '👹',
    weight: 10, months: null, hp: 1, minutes: null,
    damage: { food: 1, doom: 1, potion: 1 },
    traits: { missHeal: 0.02 },
    about: 'Don\'t feed them: every missed throw heals them.',
    lines: {
      arrive: 'Someone fed the cute little guy after midnight. Now there are forty of them, and they\'re in the projection booth.',
      defeat: '{mvp} throws open the snack-bar doors at sunrise. Forty gremlins melt into forty puddles of regret.',
      escape: 'The gremlins steal a car, the radio and the movie. Last seen doing donuts in the parking lot.',
      grab: [
        '{monster} swarm {fighter} and carry them off over their heads like a crowd-surfing rock star. Somebody /rescue them!',
        'A dozen {monster} tie {fighter}\'s shoelaces together and drag them toward the blender. Somebody /rescue them!',
        '{monster} drop a net on {fighter} and giggle like tiny cackling kettles. Somebody /rescue them!',
      ],
      poison: [
        '{monster} dose {fighter}\'s soda with something green. {fighter} hiccups bubbles. A helpful /potion will cure them!',
        '{fighter} gets a spit-take of gremlin goo straight to the face. It tingles. Then it burns. A helpful /potion will cure them!',
        '{monster} sneak spiders into {fighter}\'s nachos. Spiders AND poison. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} cackle in the dark. Somewhere, a very small voice yells "Mohawk!" and the lights go out.',
        '{monster} fire up the popcorn machine and aim it at the crowd. Rude, and also a little bit delicious.',
        '{monster} hijack the PA and sing "Hello, my baby" at a volume that is not legal.',
      ],
    },
  },

  count: {
    name: 'The Count', emoji: '🧛',
    weight: 10, months: null, hp: 1, minutes: null,
    damage: { food: 1, doom: 1, potion: 1 },
    traits: { poisonMult: 0.5, actWeights: { grab: 55, poison: 30, roar: 15 } },
    about: 'Bites more often; poison barely touches him.',
    lines: {
      arrive: 'A man in a cape steps out of a fog bank that wasn\'t there a second ago. "I do not drink… soda."',
      defeat: '{mvp} opens the sunroof at exactly the right moment. The Count is now a cape and a small pile of dust.',
      escape: 'The Count turns into a bat and flaps off with the box-office cash. He leaves a very polite thank-you note.',
      grab: [
        '{monster} sweeps {fighter} into his cape with a flourish. "Ve vill have such fun!" Somebody /rescue them!',
        '{monster} glides over, spins {fighter} into a dramatic dip, and bares his fangs. Somebody /rescue them!',
        '{fighter} looks into {monster}\'s eyes and forgets their own name. Also how to walk away. Somebody /rescue them!',
      ],
      poison: [
        '{monster} nips {fighter} on the neck. Two little holes, one big chill. A helpful /potion will cure them!',
        '{fighter} has been bitten, feels weak, and is suddenly very into capes and fog. A helpful /potion will cure them!',
        '{monster} breathes a pale mist over {fighter}, who goes gray, wobbles, and faints like a Victorian lady. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} hisses, flashes his fangs, then tries to fix his hair in a mirror that shows nothing. Awkward.',
        '"I never drink… coffee," says {monster}, and thunder cracks on cue. Nobody asked about coffee.',
        '{monster} counts the popcorn kernels on the ground and gets very, very excited about it.',
      ],
    },
  },

  wolfman: {
    name: 'The Wolfman', emoji: '🐺',
    weight: 10, months: null, hp: 1, minutes: null,
    damage: { food: 1, doom: 1, potion: 1 },
    traits: { actHeal: 0.015, silverMult: 5 },
    about: 'Heals as he goes, but silver hits him five times as hard.',
    lines: {
      arrive: 'A howl. A full moon. A guy in a flannel shirt about to have a very hairy evening.',
      defeat: '{mvp} lands the silver. The Wolfman shrinks back into a very embarrassed guy in torn flannel.',
      escape: 'The Wolfman bolts into the woods with a hot dog in each hand.',
      grab: [
        '{monster} scoops up {fighter} by the collar and lopes toward the treeline, wagging. Somebody /rescue them!',
        '{monster} tackles {fighter} like a golden retriever with claws. Very fond of them. Very not good. Somebody /rescue them!',
        '{fighter} gets dragged into the bushes by {monster}, who is clearly not taking "no" for an answer. Somebody /rescue them!',
      ],
      poison: [
        '{monster} scratches {fighter}, who notices a worrying amount of new hair already. A helpful /potion will cure them!',
        '{fighter} gets nipped by {monster} and starts to feel feverish and weirdly hungry for steak. A helpful /potion will cure them!',
        '{monster} bites {fighter}, who now has an itchy full-moon rash and a sudden love of the howling. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} throws back his head and howls so long the neighbor\'s dog starts howling back.',
        '{monster} sniffs the air, finds the nachos, and gets distracted for a good ten seconds.',
        '{monster} scratches behind his ear with a hind leg. It is both terrifying and extremely relatable.',
      ],
    },
  },

  klowns: {
    name: 'Killer Klowns', emoji: '🤡',
    weight: 10, months: null, hp: 1, minutes: null,
    damage: { food: 1, doom: 1, potion: 1 },
    traits: { grabCount: 2 },
    about: 'Grabs two fighters at a time.',
    lines: {
      arrive: 'A circus tent lands in Row F. Out climb klowns. And more klowns. And somehow more klowns.',
      defeat: '{mvp} pops the big one\'s nose and the whole troupe goes off like balloons.',
      escape: 'The tent lifts off with a honk. Everyone\'s popcorn is now cotton candy. Nobody asked for this.',
      grab: [
        '{monster} wrap {fighter} up in a cotton-candy cocoon. It is sticky AND strangely comfy. Somebody /rescue them!',
        '{monster} stuff {fighter} into a tiny car. Twenty-three klowns are already in it. Somebody /rescue them!',
        '{monster} fold {fighter} into a balloon animal. {fighter} is somehow a very poor giraffe. Somebody /rescue them!',
      ],
      poison: [
        '{monster} pie {fighter} in the face. It is a poison pie. It also tastes terrible. A helpful /potion will cure them!',
        '{fighter} gets squirted with a flower that is definitely not water. A helpful /potion will cure them!',
        '{monster} hand {fighter} a "free sample" of cotton candy. {fighter} turns blue and starts honking. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} honk their horns in perfect, awful harmony.',
        '{monster} juggle a bowling ball, a chainsaw and a cat. The cat is fine. It is the best juggler of the three.',
        '{monster} do a very long mime routine. It is somehow the scariest thing on the lot.',
      ],
    },
  },

  pods: {
    name: 'Pod People', emoji: '🌱',
    weight: 10, months: null, hp: 1.15, minutes: null,
    damage: { food: 1, doom: 1, potion: 1 },
    traits: { poisonOnly: true, poisonCount: 2, poisonForever: true },
    about: 'Never grabs: poisons two at a time, and it doesn\'t wear off.',
    lines: {
      arrive: 'Big seed pods appear in every trunk. They\'re humming. Don\'t fall asleep.',
      defeat: '{mvp} torches the last pod. Everyone checks each other for sameness. Seems fine. Probably.',
      escape: 'The pods roll off into the night. Tomorrow three regulars will be eerily calm.',
      grab: [
        '{monster} sprout vines around {fighter} and quietly tuck them in for a very long nap. Somebody /rescue them!',
        '{monster} pop open and a seed-copy of {fighter} blinks back, a little too serene. Somebody /rescue them!',
        '{monster} wrap {fighter} in leaves, which is both a hug and a threat. Somebody /rescue them!',
      ],
      poison: [
        '{monster} puff spores at {fighter}, who yawns and stops having opinions about movies. A helpful /potion will cure them!',
        '{fighter} breathes in a pod cloud and starts agreeing with everyone. Alarming. A helpful /potion will cure them!',
        '{monster} drift pollen over {fighter}, whose eyelids droop to a deeply suspicious half-mast. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} hum a single note that gets a little more wrong and a lot more disturbing the longer you listen.',
        '{monster} rustle all together, like a very polite army of salad.',
        '{monster} all point at once and let out the shriek. You know the one.',
      ],
    },
  },

  shark: {
    name: 'Land Shark', emoji: '🦈',
    weight: 10, months: null, hp: 1.1, minutes: null,
    damage: { food: 1.5, doom: 0.75, potion: 1 },
    traits: {},
    about: 'Loves a snack: food fight does one and a half times the damage; dooms bounce off.',
    lines: {
      arrive: 'A dorsal fin cuts through the parking lot. Through the asphalt. Nobody\'s going to the restroom now.',
      defeat: '{mvp} jams a whipped-cream can in its jaws. "Smile!" Dessert everywhere.',
      escape: 'The fin slides off under the screen. Somebody\'s going to need a bigger parking lot.',
      grab: [
        '{monster} bursts out of the asphalt and swallows {fighter} whole, sandals and all. Somebody /rescue them!',
        '{monster} grabs {fighter} by the hoodie and goes back under. The asphalt closes like a zipper. Somebody /rescue them!',
        '"Candygram!" says {monster}, and {fighter} opens the door, which was a mistake. Somebody /rescue them!',
      ],
      poison: [
        '{monster} drools something unpleasant on {fighter}, who now smells like a tuna sandwich in July. A helpful /potion will cure them!',
        '{fighter} gets a nip from {monster} and starts to feel seasick, on land. A helpful /potion will cure them!',
        '{monster} slaps {fighter} with a fin carrying some very bad bacteria. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} surfaces, looks around, and slowly goes back under. The cars are absolutely the wrong kind of prey.',
        '{monster} chomps a traffic cone. It makes a noise like a Pringles can. It is not a hit.',
        'Dun-dun. Dun-dun. {monster} swims in a lazy circle around the popcorn stand, just to make a point.',
      ],
    },
  },

  them: {
    name: 'THEM!', emoji: '🐜',
    weight: 10, months: null, hp: 1.3, minutes: null,
    damage: { food: 1, doom: 1, potion: 1 },
    traits: { hitBonus: 2 },
    about: 'Big swarm, big HP, but every hit you land does a little extra damage.',
    lines: {
      arrive: 'Giant ants pour out of the playground sandbox. The 1950s called; they want their warning back.',
      defeat: '{mvp} drops the last one with a can of bug spray the size of a fire hydrant.',
      escape: 'The ants carry off the concession stand piece by piece, in a very orderly line.',
      grab: [
        'An ant the size of a Buick clamps onto {fighter} and starts to march home with them. {monster} are efficient. Somebody /rescue them!',
        '{monster} carry {fighter} off like a stray crumb at a picnic. {fighter} waves, helpless. Somebody /rescue them!',
        '{monster} scoop up {fighter} in their jaws and parade them to the colony. Very organized. Somebody /rescue them!',
      ],
      poison: [
        '{monster} spray formic acid at {fighter}, who now smells like a pickle with a grudge. A helpful /potion will cure them!',
        '{fighter} gets stung by something the size of a rolled-up newspaper. A helpful /potion will cure them!',
        '{monster} squirt venom at {fighter} with the aim of a very annoyed squirt gun. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} screech their eerie warning chirp. A man in a lab coat yells "Those are the sounds from the desert!"',
        '{monster} wave their antennae at the screen. It looks like they\'re judging the sequel.',
        '{monster} start a conga line of giant ants. It is both menacing and adorable.',
      ],
    },
  },

  thing: {
    name: 'The Thing', emoji: '👽',
    weight: 10, months: null, hp: 1, minutes: null,
    damage: { food: 1, doom: 1, potion: 1 },
    traits: { grabTop: true },
    about: 'Goes after whoever\'s hurting it most.',
    lines: {
      arrive: 'The new guy in Row C is acting off. His hot dog just looked at you.',
      defeat: '{mvp} runs the hot-wire blood test. The Thing screams, splits and fries. Everyone\'s still themselves. Mostly.',
      escape: 'The Thing slips into the crowd. Everyone side-eyes everyone for the rest of the night.',
      grab: [
        '{monster} spots {fighter} swinging hardest and wraps a tentacle around their ankle. Somebody /rescue them!',
        '{monster} has had enough of {fighter}\'s swinging, and a spidery dog-legged thing goes straight for them. Somebody /rescue them!',
        '{monster} hits {fighter} where it hurts: their sleeve just turned into a tentacle and it\'s pulling. Somebody /rescue them!',
      ],
      poison: [
        '{monster} stabs {fighter} with a very rude appendage. They feel wrong in a way they can\'t put into words. A helpful /potion will cure them!',
        '{fighter} gets a drop of {monster} on the sleeve and it\'s crawling up their arm. A helpful /potion will cure them!',
        '{monster} spits something pale and writhing at {fighter}. Not great, not great at all. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} makes a noise like a dozen dogs in a blender, just to be rude.',
        '{monster} stares at the crowd with eleven eyes and then very slowly blinks twelve times.',
        '{monster} oozes out of a block of ice, a roll of tape and a lunchbox. Nobody can explain it.',
      ],
    },
  },

  lizard: {
    name: 'Atomic Lizard', emoji: '🦖',
    weight: 4, months: null, hp: 1.15, minutes: 60,
    damage: { food: 1, doom: 1, potion: 1 },
    traits: { loot: 2 },
    // Its own `minutes` (an hour) apply at quick pace only (gamePace.defaultSiegeMinutes):
    // a week campaign is a week whatever comes for the drive-in, so its words don't promise an hour
    about: 'Rare and radioactive: twice the loot, and a tougher hide.',
    lines: {
      arrive: 'The screen shows a giant lizard. Then the screen *is* a giant lizard. Then the screen is gone.',
      defeat: '{mvp} hits it right in the glowing bits. It wobbles, roars, and wades back to the ocean.',
      escape: 'It steps on the projection booth and stomps off toward the city. The city has been warned.',
      grab: [
        '{monster} plucks {fighter} out of the crowd with two claws the size of school buses. Somebody /rescue them!',
        '{monster} lifts {fighter} up for a closer look. {fighter} has a fine view of the ceiling. Somebody /rescue them!',
        '{monster} scoops {fighter} up like a sushi roll with sandals on. Somebody /rescue them!',
      ],
      poison: [
        '{monster} breathes a blue glow over {fighter}, who is now radioactive and a bit tingly. A helpful /potion will cure them!',
        '{fighter} catches a face-full of atomic breath and starts to glow at a worrying volume. A helpful /potion will cure them!',
        '{monster} drools a puddle of green onto {fighter}\'s sneakers. The sneakers are gone. {fighter} is next. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} lets out a roar that shakes the speakers and the fillings in everyone\'s teeth.',
        '{monster} steps on a minivan, then looks apologetic. Not apologetic enough.',
        '{monster} swishes its tail and takes out the lamppost, the bench and a small nearby hill.',
      ],
    },
  },

  horseman: {
    name: 'Headless Horseman', emoji: '🎃',
    weight: 20, months: [10], hp: 1, minutes: null,
    damage: { food: 1.25, doom: 0.75, potion: 1 },
    traits: { loot: 2 },
    about: 'October only: twice the loot. Pumpkin splatter loves food fights; dooms slide right off.',
    lines: {
      arrive: 'Hoofbeats. A rider with a flaming jack-o\'-lantern where the head should be.',
      defeat: '{mvp} knocks the pumpkin clean off. The horse shrugs and trots home.',
      escape: 'He gallops off with the snack bar\'s entire pumpkin-pie supply.',
      grab: [
        '{monster} thunders past and sweeps {fighter} up onto the saddle. The ride is bumpy and haunted. Somebody /rescue them!',
        '{monster} lassos {fighter} with a corn-husk rope and drags them toward the dark bridge. Somebody /rescue them!',
        '{monster} grabs {fighter} and rides off into the hollow, cackling from a place with no mouth. Somebody /rescue them!',
      ],
      poison: [
        '{monster} lobs a rotten jack-o\'-lantern at {fighter}, who is now covered in a green pumpkin ooze. A helpful /potion will cure them!',
        '{fighter} breathes in a puff of smoke from the flaming pumpkin and starts to wheeze like a haunted accordion. A helpful /potion will cure them!',
        '{monster} flicks a pinch of cursed pumpkin spice at {fighter}, who comes down with an instant autumn fever. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} lifts the flaming pumpkin and lets out a roar. Technically it\'s the pumpkin. Still scary.',
        '{monster} rears his horse in a flash of lightning. The horse looks bored.',
        '{monster} throws his head back, which is awkward because the head is in his hand.',
      ],
    },
  },
});

export const MONSTER_KEYS = Object.freeze(Object.keys(MONSTERS));
