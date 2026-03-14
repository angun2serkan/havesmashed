use rand::seq::SliceRandom;

/// 256 common English words for mnemonic generation.
/// 12 words from 256 = 96 bits of entropy (very secure).
const WORDLIST: [&str; 256] = [
    "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
    "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
    "acoustic", "acquire", "across", "action", "actor", "actual", "adapt", "address",
    "adjust", "admit", "adult", "advance", "advice", "aerobic", "affair", "afford",
    "afraid", "again", "agent", "agree", "ahead", "airport", "aisle", "alarm",
    "album", "alcohol", "alert", "alien", "allow", "almost", "alone", "alpha",
    "already", "alter", "always", "amateur", "amazing", "among", "amount", "amused",
    "analyst", "anchor", "ancient", "anger", "angle", "angry", "animal", "ankle",
    "announce", "annual", "another", "answer", "antenna", "antique", "anxiety", "apart",
    "apology", "appear", "apple", "approve", "april", "arctic", "arena", "argue",
    "armor", "army", "arrange", "arrest", "arrive", "arrow", "artist", "artwork",
    "aspect", "asset", "assist", "assume", "athlete", "atom", "attack", "attend",
    "auction", "audit", "august", "autumn", "average", "avocado", "avoid", "awake",
    "aware", "awesome", "awful", "bamboo", "banana", "banner", "barely", "bargain",
    "barrel", "basic", "basket", "battle", "beach", "beauty", "become", "bedroom",
    "believe", "benefit", "bicycle", "blanket", "blossom", "bonus", "border", "bottom",
    "bounce", "bracket", "brain", "breeze", "bridge", "bright", "broken", "bronze",
    "brush", "bubble", "budget", "buffalo", "bullet", "bundle", "burden", "butter",
    "cabin", "cable", "cactus", "camera", "campus", "canal", "cancel", "canyon",
    "carbon", "carpet", "casual", "catalog", "caught", "ceiling", "cement", "census",
    "cereal", "certain", "chair", "chapter", "cherry", "chicken", "chief", "chimney",
    "choice", "circle", "citizen", "classic", "clever", "clinic", "clock", "cluster",
    "coach", "coconut", "coffee", "collect", "color", "column", "combine", "comfort",
    "company", "concert", "conduct", "confirm", "connect", "control", "convert", "cookie",
    "coral", "corner", "cosmic", "cotton", "country", "couple", "course", "cousin",
    "cover", "cradle", "craft", "crater", "credit", "cricket", "crisis", "crisp",
    "crystal", "culture", "curtain", "custom", "cycle", "damage", "dance", "danger",
    "daughter", "dawn", "debate", "decade", "decide", "decline", "define", "deliver",
    "demand", "depart", "depend", "deposit", "desert", "design", "detail", "detect",
    "device", "diamond", "digital", "dinner", "dinosaur", "direct", "discover", "display",
    "dolphin", "domain", "donate", "double", "dragon", "dream", "drift", "during",
    "eagle", "early", "earth", "easily", "editor", "effort", "eight", "either",
];

/// Generate a 12-word mnemonic phrase.
pub fn generate_mnemonic() -> String {
    let mut rng = rand::thread_rng();
    let words: Vec<&str> = WORDLIST
        .choose_multiple(&mut rng, 12)
        .copied()
        .collect();
    words.join(" ")
}
