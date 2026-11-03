/**
 * Lines for `/siege attack weapon:food|doom|potion` — a member fighting the
 * monster that is attacking the drive-in. The normal /foodfight, /doom and
 * /potion lines are written about a PERSON ("wishes for eternal youth on
 * <@ben>'s monkey's paw"); with a monster's name dropped in as the target they
 * read oddly, so these are written for the fight itself.
 *
 * SHAPE — this is a contract. The siege engine reads exactly this and nothing
 * else, so a typo'd outcome would silently fall out of the weighted pick:
 *
 *   SIEGE_ATTACK_LINES = {
 *     food:   [{ text, outcome: 'hit' | 'miss' | 'backfire' }, …],
 *     doom:   [{ text, outcome: 'doomed' | 'escaped' | 'backfired' }, …],
 *     potion: [{ text, outcome: 'worked' | 'backfired' }, …],
 *   }
 *
 * PLACEHOLDERS — every line has {user} and {monster} exactly once, and no
 * other placeholder.
 *   {user}     the attacker (the engine fills in a mention)
 *   {monster}  the monster's display name, already bold (**The Blob**)
 * Some names are plural (Gremlins, Killer Klowns, Pod People, THEM!), so a
 * line must read correctly for singular AND plural. That means: never
 * conjugate a verb with {monster} as the subject ("{monster} dies" breaks for
 * Gremlins), never put "the"/"a" in front of it (the name may already start
 * with "The"), never make it possessive, and don't refer back to it with
 * it/its/they/them. Use "{user} does X to {monster}" and describe what happens
 * with the noun ("the splat", "the curse", "the aftermath"), not a pronoun.
 *
 * PROPORTIONS — the outcome mix below is deliberate and the fight balance
 * depends on it, because the engine picks an outcome by game rules and then a
 * random line of that outcome:
 *   food:   30 hit / 12 miss / 8 backfire
 *   doom:   30 doomed / 10 escaped / 10 backfired
 *   potion: 26 worked / 10 backfired
 * Adding lines to one outcome only is fine for variety; it never changes the
 * odds (those live in the engine), but tests/siege-attack-lines.test.js pins
 * the counts so a rebalance is a decision, not an accident.
 *
 * TONE — horror-comedy, PG-13. Cartoon gore and mild swearing ("damn") are
 * fine; nothing hateful, sexual, or aimed at a real person. Monster-agnostic:
 * the same line has to work against a blob, a werewolf, giant ants, a kaiju, a
 * vampire or killer clowns, so no single-monster references. Drive-in flavour
 * (screen, projection booth, concession stand, car hoods, pole speakers, the
 * back row, Row F) is encouraged. Lines open with one emoji, like the other
 * game lines. Keep each under 220 characters.
 *
 *   miss / escaped      the attack fails harmlessly: it splashes nearby, or the
 *                       monster shrugs the curse off
 *   backfire / backfired  the attack lands on {user} (or a bystander's car)
 */
export const SIEGE_ATTACK_LINES = Object.freeze({
  food: Object.freeze([
    // ---- hit (30) ----
    { text: '🥧 {user} winds up and plants a cream pie square on {monster}. Direct hit. The Three Stooges would weep.', outcome: 'hit' },
    { text: '🍝 {user} upends a whole tray of spaghetti over {monster}. Al dente, and extremely personal.', outcome: 'hit' },
    { text: '🍿 {user} hurls an entire large popcorn tub at {monster}. Butter everywhere. The refill is free, the humiliation is not.', outcome: 'hit' },
    { text: '🌭 {user} fires hot dogs at {monster} like a concession-stand machine gun. Relish: applied. Dignity: gone.', outcome: 'hit' },
    { text: '🥤 {user} dumps a blue-raspberry slushie straight down {monster}. Brain freeze, drive-in edition.', outcome: 'hit' },
    { text: '🧀 {user} slams a tray of nachos into {monster}, cheese pump still going. Lava-hot, orange, and sticking to everything.', outcome: 'hit' },
    { text: '🌶️ {user} ladles scalding chili over {monster} from the concession window. Extra jalapeños. Zero apologies.', outcome: 'hit' },
    { text: '🌽 {user} hurls a corn dog like a javelin and spears {monster} dead center. Mustard on the side.', outcome: 'hit' },
    { text: '🥒 {user} chucks a pickle the size of a baseball bat at {monster}. It lands with a wet THWACK that echoes off the screen.', outcome: 'hit' },
    { text: '🍦 {user} empties a can of whipped cream into {monster}, then lights a sparkler for no reason. Dessert is served.', outcome: 'hit' },
    { text: '🍕 {user} sails a pizza at {monster} like a frisbee. Three slices stick, the pepperoni slides off one at a time.', outcome: 'hit' },
    { text: '🍅 {user} cross-draws two squeeze bottles and paints {monster} in ketchup and mustard. A walking Chicago hot dog.', outcome: 'hit' },
    { text: '🍧 {user} heaves a cherry sno-cone into {monster}. Red syrup everywhere. Looks like the movie, tastes like regret.', outcome: 'hit' },
    { text: '🍬 {user} empties a box of Junior Mints at {monster} in a rapid-fire barrage. Every shot is cool, refreshing, and stings.', outcome: 'hit' },
    { text: '🍭 {user} slings a wad of cotton candy onto {monster}. It sticks in a sugary web. Nobody can pull it off. Nobody wants to.', outcome: 'hit' },
    { text: '🥨 {user} throws a jumbo pretzel rod like a spear and sticks {monster} right in the middle. Salt in the wound. Literally.', outcome: 'hit' },
    { text: '🍩 {user} flings a hot funnel cake at {monster}. Powdered sugar explodes in a cloud like a very sweet bomb.', outcome: 'hit' },
    { text: '🍔 {user} smashes a triple cheeseburger into {monster} from point-blank range. Pickles, onions, and a sesame seed bun to the face.', outcome: 'hit' },
    { text: '🧃 {user} aims a soda fountain hose at {monster} and opens it all the way. Sticky, fizzy, and a violation of several health codes.', outcome: 'hit' },
    { text: '🧈 {user} dumps a bucket of mac and cheese onto {monster}. Gooey, orange, and the gravel will remember this for years.', outcome: 'hit' },
    { text: '🍖 {user} bowls a meatball the size of a volleyball at {monster}. Strike. Sauce spray hits the back row.', outcome: 'hit' },
    { text: '🫑 {user} lobs a basket of jalapeño poppers at {monster}. Each one pops on contact. Nobody asked for the cream cheese.', outcome: 'hit' },
    { text: '🍨 {user} piles a triple-scoop sundae onto {monster}, cherry and all. The cherry hits last, and it hits hard.', outcome: 'hit' },
    { text: '🍌 {user} lobs a banana cream pie from the back of the lot and lands it on {monster}. Row F stands and applauds.', outcome: 'hit' },
    { text: '🍗 {user} hurls a family-size bucket of fried chicken at {monster}. Drumsticks go everywhere. Wings for the win.', outcome: 'hit' },
    { text: '🦃 {user} swings a giant turkey leg like a baseball bat and connects with {monster}. The crowd goes wild. The grease goes wilder.', outcome: 'hit' },
    { text: '🥗 {user} dumps a cooler of tailgate potato salad on {monster}. It has been in the sun since noon. Warning: biohazard.', outcome: 'hit' },
    { text: '🥚 {user} empties a whole egg carton at {monster} from the back of a pickup. Splat, splat, splat. Halloween came early.', outcome: 'hit' },
    { text: '🧊 {user} swings a bag of ice from the concession cooler right into {monster}. Cold, wet, and satisfying as hell.', outcome: 'hit' },
    { text: '🍫 {user} fires a chocolate fountain at {monster} from the concession stand. Rich, brown, and everywhere. The drive-in will clean that up in 2031.', outcome: 'hit' },
    // ---- miss (12) ----
    { text: '🥧 {user} slings a pie at {monster} and misses by a mile. It hits the screen and slides down the credits in slow motion.', outcome: 'miss' },
    { text: '🍝 {user} throws a bowl of spaghetti at {monster}. It sails clear and lands on a Buick hood three rows over. Somebody is getting a note.', outcome: 'miss' },
    { text: '🍿 {user} chucks a popcorn tub at {monster}. It bounces off a speaker pole and showers Row F in butter. Dinner and a show.', outcome: 'miss' },
    { text: '🌭 {user} fires a hot dog at {monster}. The pitch curves, drops, and a stray dog snags it on the way. Zero damage, one very happy dog.', outcome: 'miss' },
    { text: '🥤 {user} tosses a slushie at {monster}. It splashes the gravel instead, and a puddle of cherry red spreads across the lot.', outcome: 'miss' },
    { text: '🧀 {user} heaves a nacho tray at {monster}. The aim is off, and a nearby car stereo gets a cheese facial. Somebody is not going to love that.', outcome: 'miss' },
    { text: '🍕 {user} launches a pizza at {monster}. A gust catches the box, and the whole thing lands on the ticket booth roof. The attendant sighs.', outcome: 'miss' },
    { text: '🍦 {user} sprays whipped cream at {monster}. The can sputters, drools, and finishes the job on a pair of very confused sneakers.', outcome: 'miss' },
    { text: '🍔 {user} lobs a burger at {monster} and sails it over the fence. It lands in the adjoining cornfield. A scarecrow gets lunch.', outcome: 'miss' },
    { text: '🍗 {user} hurls a drumstick at {monster} and clips a speaker instead. Now every car in Row C is hearing crunching in stereo.', outcome: 'miss' },
    { text: '🍩 {user} flings a funnel cake at {monster}. The wind takes it, and the powdered sugar paints the projection booth window in white.', outcome: 'miss' },
    { text: '🌽 {user} throws a corn dog javelin at {monster}. It skewers a drive-in sign instead. The screen now reads "EAT AT JOE\'S".', outcome: 'miss' },
    // ---- backfire (8) ----
    { text: '🥧 {user} pulls back for a power-throw at {monster}, slips on stray whipped cream, and wears the pie. Instant karma, extra crust.', outcome: 'backfire' },
    { text: '🍝 {user} spins a plate of spaghetti toward {monster}, lets go early, and sprays a minivan. The family inside takes it personally.', outcome: 'backfire' },
    { text: '🍿 {user} swings a popcorn tub at {monster}, and the lid pops off backward. The thrower is now an extremely buttered snowman.', outcome: 'backfire' },
    { text: '🌭 {user} loads a hot dog cannon at {monster}, forgets to aim, and blasts a pristine Camaro. The owner had one job: finding a better parking spot.', outcome: 'backfire' },
    { text: '🥤 {user} flips a slushie at {monster} with a dramatic wind-up, and the whole thing slings backward. Brain freeze, self-inflicted.', outcome: 'backfire' },
    { text: '🧀 {user} dips a nacho into cheese sauce and flicks it toward {monster}. Hot cheese rebounds off the screen and tags the flicker right in the eye.', outcome: 'backfire' },
    { text: '🍕 {user} frisbees a pizza at {monster} and it boomerangs right back. A pie to the face is a pie to the face.', outcome: 'backfire' },
    { text: '🍦 {user} fires the whipped cream can at {monster}. The nozzle is on backward. The bearded look suits our hero, honestly.', outcome: 'backfire' },
  ]),

  doom: Object.freeze([
    // ---- doomed (30) ----
    { text: '📼 {user} slides a cursed VHS into the projector and aims the beam at {monster}. Seven days later, the credits roll. Be kind. Rewind.', outcome: 'doomed' },
    { text: '👧 {user} gives the final girl\'s speech to {monster}. Every line lands, every word bites. This movie is officially over.', outcome: 'doomed' },
    { text: '🏃 {user} hisses "never split up" at {monster}. The curse takes effect immediately. Everyone knows how that ends.', outcome: 'doomed' },
    { text: '📖 {user} reads an ancient incantation from a paperback found in the glove box and points it at {monster}. The back cover said "do not read aloud." Too late.', outcome: 'doomed' },
    { text: '🎞️ {user} swings the projector beam over {monster} and holds it there. Fifty feet of screen-sized doom, now playing in the parking lot.', outcome: 'doomed' },
    { text: '🔮 {user} lays out a ouija board on a car hood and asks {monster} one question: "goodbye?" The planchette spells G-O-O-D-B-Y-E. Spooky.', outcome: 'doomed' },
    { text: '🎬 {user} promises {monster} a sequel. The curse of the sequel is real, and every follow-up gets worse. Doom, delivered.', outcome: 'doomed' },
    { text: '🪦 {user} points a bony finger at {monster} and intones "you have been warned." The ground answers by opening.', outcome: 'doomed' },
    { text: '🧙 {user} chants backward Latin from a cereal-box decoder ring at {monster}. Somehow, the wrong cereal brand was exactly right.', outcome: 'doomed' },
    { text: '🕯️ {user} lights a black candle in the back row and whispers a name at {monster}. Candles are not allowed in the lot. The curse does not care.', outcome: 'doomed' },
    { text: '🪞 {user} chants three times at the snack bar bathroom mirror and points the glass at {monster}. Bloody Mary shows up with a lot of thoughts.', outcome: 'doomed' },
    { text: '📞 {user} calls {monster} on a rotary phone. The voice on the line says "I know what you did last summer." Doomed, with caller ID.', outcome: 'doomed' },
    { text: '🔔 {user} rings the old projection-booth bell thirteen times at {monster}. The twelfth is fine. The thirteenth is the end of the movie.', outcome: 'doomed' },
    { text: '🧛 {user} hangs garlic from every speaker pole and curses {monster} in a monotone. The soundtrack goes silent. So does everything else.', outcome: 'doomed' },
    { text: '🎃 {user} carves a jack-o\'-lantern in the likeness of {monster} and cracks it with a single blow. Every pumpkin in the lot goes dark.', outcome: 'doomed' },
    { text: '📺 {user} turns every car radio to static and points the antenna at {monster}. A pale girl climbs out of the screen. She knows what to do.', outcome: 'doomed' },
    { text: '🎤 {user} grabs the drive-in mic and announces "the call is coming from inside the house" at {monster}. Dead silence. Then lights out.', outcome: 'doomed' },
    { text: '🕸️ {user} reads {monster} the terms and conditions of a cursed Terms of Service. Clause 13 is the one that gets everyone.', outcome: 'doomed' },
    { text: '🔦 {user} pins {monster} in a flashlight beam and says the dreaded words: "I\'ll be right back." The curse of the cliché takes hold.', outcome: 'doomed' },
    { text: '⚰️ {user} pops open a coffin lid in the back row and tips {monster} inside with a polite, well-practiced shove. Rest in pieces.', outcome: 'doomed' },
    { text: '🩸 {user} drips a single drop of cursed popcorn butter on {monster}. The butter hisses, spreads, and writes a name in cursive. The name is "Goodbye."', outcome: 'doomed' },
    { text: '🌕 {user} holds up a mirror to the full moon and bounces the glare onto {monster}. A very expensive silver-plated curse follows.', outcome: 'doomed' },
    { text: '🏚️ {user} shouts "it\'s just the wind!" at {monster}. It is absolutely not the wind. The house is now very much in session.', outcome: 'doomed' },
    { text: '🔪 {user} yells "I\'m going to check the basement" and sends {monster} down instead. Slasher rules: bad idea. Slasher rules: bad outcome.', outcome: 'doomed' },
    { text: '📻 {user} plays a cursed track on the pole speakers and aims the volume at {monster}. The bass is evil. The treble is worse.', outcome: 'doomed' },
    { text: '🎟️ {user} tears a free ticket stub in half and hands {monster} the unlucky side. Admission includes one (1) cursed night. No refunds.', outcome: 'doomed' },
    { text: '🧟 {user} leads {monster} into a cursed cornfield "just for a quick look." The cornfield sorts the rest out. Rows and rows of rows.', outcome: 'doomed' },
    { text: '👻 {user} dials the drive-in\'s resident ghost, and the ghost takes a personal interest in {monster}. Ghosts hold grudges. Ghosts hold forever.', outcome: 'doomed' },
    { text: '🌑 {user} blows out every light in the lot with one long, spooky exhale and curses {monster} in the dark. When the screen flickers back on, the problem is solved.', outcome: 'doomed' },
    { text: '🪓 {user} quotes the one rule every horror movie shares: the loud one dies first. Then a finger swings toward {monster}, the loudest one here. Rules are rules.', outcome: 'doomed' },
    // ---- escaped (10) ----
    { text: '📼 {user} slides a cursed VHS toward {monster}. The tape chews, jams, and stops in the machine. Be kind. Rewind. Try again.', outcome: 'escaped' },
    { text: '👧 {user} delivers a rousing final-girl speech at {monster}. The only reaction is a polite yawn and a glance at a wristwatch.', outcome: 'escaped' },
    { text: '📖 {user} reads a spell from a paperback at {monster}, then turns the page and finds the last chapter is torn out. The curse fizzles at the cliffhanger.', outcome: 'escaped' },
    { text: '🔮 {user} summons the ouija board against {monster}. The planchette spells B-O-R-I-N-G and slides off the board. Nothing happens.', outcome: 'escaped' },
    { text: '🕯️ {user} lights a black candle and chants at {monster}. The wick sputters in the breeze. The curse is blown out before it begins.', outcome: 'escaped' },
    { text: '🎬 {user} dooms {monster} with the curse of the sequel. The sequel flops, nobody remembers it, and the curse is on the shelf with the unsold tickets.', outcome: 'escaped' },
    { text: '🪦 {user} points a bony finger at {monster} and intones a warning. The warning bounces off a very large, very unbothered shrug.', outcome: 'escaped' },
    { text: '🏃 {user} shouts "never split up" at {monster}. No one is splitting up. Everyone stays together and has a lovely time. The curse has no one to doom.', outcome: 'escaped' },
    { text: '🪞 {user} chants three times at the mirror to curse {monster}. Nothing. Bloody Mary does not show up. She had other plans.', outcome: 'escaped' },
    { text: '📞 {user} places a spooky call to {monster}. Straight to voicemail. The voicemail is full. The curse waits on hold forever.', outcome: 'escaped' },
    // ---- backfired (10) ----
    { text: '📼 {user} loads a cursed VHS aimed at {monster}, hits play, and the tape turns around. The rotary phone rings. It is for the person holding the remote. Seven days.', outcome: 'backfired' },
    { text: '👧 {user} starts the final-girl speech at {monster} and forgets that the speech ends with "and then I die." The speaker says it out loud. Oops.', outcome: 'backfired' },
    { text: '🏃 {user} announces "never split up" to {monster}, then immediately wanders off alone to find the bathroom. The curse notices.', outcome: 'backfired' },
    { text: '📖 {user} reads an incantation from a paperback at {monster} and mispronounces one word. The curse, offended, takes it out on the reader instead.', outcome: 'backfired' },
    { text: '🔮 {user} asks the ouija board to doom {monster}. The planchette spells out the asker\'s name instead. Wrong target, board.', outcome: 'backfired' },
    { text: '🎬 {user} threatens {monster} with the curse of the sequel, and the curse hears "sequel" as a casting call. Our hero gets the lead in Part 4.', outcome: 'backfired' },
    { text: '🕯️ {user} lights a black candle against {monster}, and the flame leaps onto the caster\'s sleeve. Stop, drop, and apologize to the occult.', outcome: 'backfired' },
    { text: '🪞 {user} chants at the mirror to curse {monster}, and Bloody Mary steps out for the chanter instead. Right chant, wrong name. Awkward.', outcome: 'backfired' },
    { text: '🎞️ {user} swings the projector beam at {monster}, but the beam finds a reel of Coming Attractions and sticks the operator in a trailer. Narrated. Forever.', outcome: 'backfired' },
    { text: '🪓 {user} tells {monster} the loud one dies first. Everybody turns to look at the loudest person in the lot. The curse turns, too.', outcome: 'backfired' },
  ]),

  potion: Object.freeze([
    // ---- worked (26) ----
    { text: '🧪 {user} hurls a flask of weed killer at {monster}. It hisses, it fizzes, it wilts. Nature\'s way of saying "trim."', outcome: 'worked' },
    { text: '💧 {user} sprays {monster} with holy-ish water from a backyard hose. Not exactly blessed, but somebody\'s priest definitely lives down the street.', outcome: 'worked' },
    { text: '⚗️ {user} dumps a smoking beaker from the snack bar onto {monster}. The label said "do not mix." The label was correct.', outcome: 'worked' },
    { text: '🧄 {user} douses {monster} in a garlic tonic and a prayer. The stench alone can clear a theater. Today it clears the lot.', outcome: 'worked' },
    { text: '🥤 {user} chucks a cup of mystery soda from the fountain onto {monster}. Nobody knows what flavor it is. Everybody now knows the flavor is regret.', outcome: 'worked' },
    { text: '🧴 {user} empties a bottle of industrial drain cleaner on {monster} and runs. It smokes, it bubbles, the parking lot hums.', outcome: 'worked' },
    { text: '🌿 {user} tosses a jug of green swamp tonic at {monster}. It glows, it gurgles, and it works faster than the label promised.', outcome: 'worked' },
    { text: '🫧 {user} pours a bottle of bleach-and-lemon cleaner over {monster}. Squeaky clean, as promised. Squeaky dead, as a bonus.', outcome: 'worked' },
    { text: '💉 {user} jabs {monster} with a syringe of neon-green serum from a "free sample" tray at the snack bar. The effect is immediate. And loud.', outcome: 'worked' },
    { text: '🧂 {user} dumps an entire canister of rock salt on {monster}. A little salt in the wound, and a lot of salt in everything else.', outcome: 'worked' },
    { text: '🍹 {user} hands {monster} a mystery cocktail in a tiki glass with a little umbrella. One sip and the lights go out. Bartender\'s special.', outcome: 'worked' },
    { text: '🍵 {user} serves {monster} a piping-hot cup of evil herbal tea from a witch\'s thermos. Chamomile, nightshade, and a splash of "oh no."', outcome: 'worked' },
    { text: '🥫 {user} cracks open a rusty can labeled "DO NOT OPEN" and dumps it on {monster}. Something in it was very much alive, and very much hostile.', outcome: 'worked' },
    { text: '🔥 {user} sprays {monster} with a can of cooking spray and a lighter from the grill. A fireball rolls through the back row. Dinner is served.', outcome: 'worked' },
    { text: '🧬 {user} flings a vial of glowing goop at {monster}. The goop was marked "experimental." The result is also marked "experimental."', outcome: 'worked' },
    { text: '🌶️ {user} douses {monster} in a ghost-pepper hot sauce from the concession stand. The label says "Mild." The label is lying.', outcome: 'worked' },
    { text: '🧃 {user} tips a gallon of expired fruit punch over {monster} from the top of a van. It fizzes, it smokes, and the dye never comes out.', outcome: 'worked' },
    { text: '🪲 {user} unleashes a bug-bomb canister at {monster} from the safety of a pickup bed. All pests, great and small, must go.', outcome: 'worked' },
    { text: '🧫 {user} pours a petri dish of "totally harmless" culture onto {monster}. It was not harmless. It was a growth industry.', outcome: 'worked' },
    { text: '🥛 {user} dumps a jug of three-week-old milk on {monster}. The smell is the weapon. The smell wins every time.', outcome: 'worked' },
    { text: '🍺 {user} sprays {monster} with a shaken keg of cheap beer. Foam, froth, and a very sticky parking lot. Row C has questions.', outcome: 'worked' },
    { text: '🔬 {user} tosses a test tube of acid-green liquid at {monster}. It sizzles, it spits, and a tiny mushroom cloud rises over the snack bar.', outcome: 'worked' },
    { text: '🧉 {user} pours an "energy drink" labeled "WARNING: EXTREME" onto {monster}. The label on the can has more warnings than words.', outcome: 'worked' },
    { text: '🪻 {user} flings a bouquet of wolfsbane, silver dust, and one suspicious daisy at {monster}. The daisy does the real work.', outcome: 'worked' },
    { text: '🫗 {user} empties a cauldron of boiling sauce over {monster}, courtesy of the chili cook-off. Four-alarm, five-star, six feet under.', outcome: 'worked' },
    { text: '🍦 {user} blends dish soap, bug spray and one cherry into a milkshake and flings the pitcher at {monster}. Please do not drink this.', outcome: 'worked' },
    // ---- backfired (10) ----
    { text: '🧪 {user} hurls a flask of weed killer at {monster} and forgets the wind. The fizz drifts back, and the thrower sprouts a very small, very sad fern.', outcome: 'backfired' },
    { text: '💧 {user} sprays holy-ish water at {monster}. The nozzle faces the wrong way, and the sprayer gets blessed instead. Nothing else happens. Soggy, though.', outcome: 'backfired' },
    { text: '⚗️ {user} swirls a smoking beaker meant for {monster} and sniffs it first for good measure. The sniffer sneezes in colors for an hour.', outcome: 'backfired' },
    { text: '🧄 {user} slings a garlic tonic at {monster}, and the cap pops off backward. The slinger now smells like an Italian restaurant. Row F relocates.', outcome: 'backfired' },
    { text: '🥤 {user} flings mystery soda at {monster}, and the lid pops. The soda geysers up and drenches the flinger in a flavor that science cannot name.', outcome: 'backfired' },
    { text: '🧴 {user} pours drain cleaner toward {monster} and trips over a speaker cable. The fizz is thorough, fast, and entirely on the pourer\'s shoes.', outcome: 'backfired' },
    { text: '🌿 {user} lobs a jug of swamp tonic at {monster}, and the jug hits the pole speaker. Green goop rains down on the lobber. Rain check on the plan.', outcome: 'backfired' },
    { text: '🧬 {user} cracks a vial of glowing goop meant for {monster}. The goop fizzles into a small green cloud that hovers over the cracker. Rude.', outcome: 'backfired' },
    { text: '🍵 {user} brews a deadly herbal tea for {monster} and takes a taste test first. The test is a fail. The test is also a nap.', outcome: 'backfired' },
    { text: '🔬 {user} prepares a test tube of acid-green liquid for {monster}, shakes it, and the stopper shoots out. The shaker is now a hat rack for foam.', outcome: 'backfired' },
  ]),
});
