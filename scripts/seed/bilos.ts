import type { MenuInput, OptionGroupInput } from "@/core";

/** The seeded Lancha venue's Venue Link is /v/bilos-lancha. */
export const LANCHA_LINK_TOKEN = "bilos-lancha";

// English dish names and descriptions are Bilo's own, from bilospastry.com (menu and home pages, Nov 2026).
// MACHINE-DRAFTED AMHARIC: every Amharic name and description below was drafted by an AI model,
// not by Bilo's. A fluent Amharic speaker must review it, and Bilo's must approve it, before the pilot.
// PLACEHOLDER PRICES: Bilo's website shows no prices. Every price below is invented for
// development and must be replaced with Bilo's real prices before the pilot.
const placeholderEtb = (birr: number) => birr * 100;

// PLACEHOLDER OPTIONS: the choices below follow Bilo's descriptions ("your choice of bagel",
// "add your choice of extras"), but the exact choices and price changes are invented and must be
// confirmed with Bilo's. So are the fasting labels, which mark only dishes that are plainly vegan.
const bagelChoice: OptionGroupInput = {
  name: { en: "Bagel", am: "ቤግል" },
  kind: "choose_one",
  required: true,
  choices: [
    { name: { en: "Plain", am: "ተራ ቤግል" } },
    { name: { en: "Sesame", am: "ሰሊጥ" } },
    { name: { en: "Everything", am: "የዘሮች ቅልቅል" } },
    { name: { en: "Whole wheat", am: "ሙሉ ስንዴ" }, priceChangeSantim: placeholderEtb(20) },
  ],
};

const omeletteExtras: OptionGroupInput = {
  name: { en: "Extras", am: "ተጨማሪዎች" },
  kind: "add_extras",
  choices: [
    { name: { en: "Cheese", am: "አይብ" }, priceChangeSantim: placeholderEtb(40) },
    { name: { en: "Mushrooms", am: "እንጉዳይ" }, priceChangeSantim: placeholderEtb(35) },
    { name: { en: "Tomato & onion", am: "ቲማቲም እና ሽንኩርት" }, priceChangeSantim: placeholderEtb(20) },
    { name: { en: "Green pepper", am: "አረንጓዴ ቃሪያ" }, priceChangeSantim: placeholderEtb(20) },
  ],
};

const coffeeExtras: OptionGroupInput = {
  name: { en: "Extras", am: "ተጨማሪዎች" },
  kind: "add_extras",
  choices: [
    { name: { en: "Extra shot", am: "ተጨማሪ ኤስፕሬሶ" }, priceChangeSantim: placeholderEtb(30) },
    { name: { en: "Vanilla syrup", am: "የቫኒላ ሽሮፕ" }, priceChangeSantim: placeholderEtb(25) },
  ],
};

export const bilosMenu: MenuInput = {
  sections: [
    {
      name: { en: "Breakfast", am: "ቁርስ" },
      dishes: [
        {
          name: { en: "Omelette", am: "ኦምሌት" },
          description: {
            en: "Start with our classic omelette and add your choice of extras",
            am: "በእኛ ክላሲክ ኦምሌት ይጀምሩ፣ የሚፈልጉትን ተጨማሪ ይምረጡ",
          },
          priceSantim: placeholderEtb(240),
          optionGroups: [omeletteExtras],
        },
        {
          name: { en: "Scrambled Eggs", am: "እንቁላል ፍርፍር" },
          description: {
            en: "Made with fresh, locally sourced eggs",
            am: "ከአካባቢው በተገኘ ትኩስ እንቁላል የተሰራ",
          },
          priceSantim: placeholderEtb(210),
        },
        {
          name: { en: "Chechebsa", am: "ጨጨብሳ" },
          description: {
            en: "Spiced flatbread with a side of honey",
            am: "በቅመም የተለወሰ ቂጣ፣ ከማር ጋር የሚቀርብ",
          },
          priceSantim: placeholderEtb(230),
        },
        {
          name: { en: "French Toast", am: "ፍሬንች ቶስት" },
          description: {
            en: "Thick slices of our freshly baked brioche, soaked and griddled to golden perfection",
            am: "ትኩስ የተጋገረ የብሪዮሽ ዳቦ ወፍራም ቁራጮች፣ ተነክረው ወርቃማ እስኪሆኑ የተጠበሱ",
          },
          priceSantim: placeholderEtb(260),
        },
        {
          name: { en: "Pancake with Syrup", am: "ፓንኬክ በሽሮፕ" },
          description: {
            en: "A timeless breakfast favorite",
            am: "ዘመን የማይሽረው የቁርስ ተወዳጅ",
          },
          priceSantim: placeholderEtb(250),
        },
        {
          name: { en: "Waffle", am: "ዋፍል" },
          description: {
            en: "Golden and irresistibly crisp",
            am: "ወርቃማ እና ቁርጥም ያለ",
          },
          priceSantim: placeholderEtb(250),
        },
        {
          name: { en: "Avocado Toast", am: "የአቮካዶ ቶስት" },
          description: {
            en: "Ripe avocado, lightly seasoned, on your choice of toast",
            am: "የበሰለ አቮካዶ በቀላል ቅመም፣ በመረጡት ቶስት ላይ",
          },
          priceSantim: placeholderEtb(280),
          optionGroups: [
            {
              name: { en: "Toast", am: "ቶስት" },
              kind: "choose_one",
              required: true,
              choices: [
                { name: { en: "White", am: "ነጭ ዳቦ" } },
                { name: { en: "Whole wheat", am: "ሙሉ ስንዴ" } },
                { name: { en: "Sourdough", am: "ሳወርዶ ዳቦ" }, priceChangeSantim: placeholderEtb(20) },
              ],
            },
          ],
        },
        {
          name: { en: "Bread Spread", am: "ዳቦ ስፕሬድ" },
          description: {
            en: "Freshly baked bagel or croissant, served with a side of jam and cream cheese",
            am: "ትኩስ የተጋገረ ቤግል ወይም ክሮሳን፣ ከጃም እና ከክሬም ቺዝ ጋር",
          },
          priceSantim: placeholderEtb(220),
          optionGroups: [
            {
              name: { en: "Bread", am: "ዳቦ" },
              kind: "choose_one",
              required: true,
              choices: [{ name: { en: "Bagel", am: "ቤግል" } }, { name: { en: "Croissant", am: "ክሮሳን" } }],
            },
          ],
        },
        {
          name: { en: "Oatmeal", am: "ኦትሚል" },
          description: {
            en: "Warm and comforting, a classic breakfast",
            am: "ሞቅ ያለ እና የሚያረካ ክላሲክ ቁርስ",
          },
          priceSantim: placeholderEtb(190),
        },
        {
          name: { en: "Vegan Oatmeal", am: "የፆም ኦትሚል" },
          description: {
            en: "Simple and wholesome, cooked in water",
            am: "ቀላል እና ጤናማ፣ በውሃ የበሰለ",
          },
          priceSantim: placeholderEtb(180),
          fasting: true,
        },
      ],
    },
    {
      name: { en: "Sandwiches & Wraps", am: "ሳንድዊቾች እና ራፖች" },
      dishes: [
        {
          name: { en: "Egg Sandwich", am: "የእንቁላል ሳንድዊች" },
          description: {
            en: "A classic breakfast sandwich with perfectly cooked eggs",
            am: "በትክክል የበሰለ እንቁላል ያለው ክላሲክ የቁርስ ሳንድዊች",
          },
          priceSantim: placeholderEtb(260),
          optionGroups: [
            {
              name: { en: "Extras", am: "ተጨማሪዎች" },
              kind: "add_extras",
              choices: [
                { name: { en: "Cheese", am: "አይብ" }, priceChangeSantim: placeholderEtb(40) },
                { name: { en: "Avocado", am: "አቮካዶ" }, priceChangeSantim: placeholderEtb(50) },
              ],
            },
          ],
        },
        {
          name: { en: "Egg Croissant Sandwich", am: "የእንቁላል ክሮሳን ሳንድዊች" },
          description: {
            en: "Flaky croissant filled with fluffy eggs",
            am: "ለስላሳ እንቁላል የተሞላ ተደራራቢ ክሮሳን",
          },
          priceSantim: placeholderEtb(290),
        },
        {
          name: { en: "Tuna Sandwich", am: "የቱና ሳንድዊች" },
          description: {
            en: "Flaked tuna and fresh vegetable toppings on a bagel bread of your choice",
            am: "የተፈረፈረ ቱና እና ትኩስ አትክልቶች፣ በመረጡት ቤግል ዳቦ ላይ",
          },
          priceSantim: placeholderEtb(380),
          optionGroups: [bagelChoice],
        },
        {
          name: { en: "Salmon Sandwich", am: "የሳልሞን ሳንድዊች" },
          description: {
            en: "Smoked salmon, cream cheese, cucumber, tomato and a touch of onion on a freshly baked bagel",
            am: "በጭስ የተዘጋጀ ሳልሞን፣ ክሬም ቺዝ፣ ኪያር፣ ቲማቲም እና ትንሽ ሽንኩርት በትኩስ ቤግል ላይ",
          },
          priceSantim: placeholderEtb(520),
        },
        {
          name: { en: "Steak Sandwich", am: "የስቴክ ሳንድዊች" },
          description: {
            en: "Savory grilled steak on a fresh, toasted roll",
            am: "ጣዕሙ የላቀ የተጠበሰ ስቴክ፣ በትኩስ እና በተቆላ ዳቦ ውስጥ",
          },
          priceSantim: placeholderEtb(480),
        },
        {
          name: { en: "Chicken Wrap", am: "የዶሮ ራፕ" },
          description: {
            en: "Grilled chicken in a soft tortilla with diced tomato, sliced onion and a touch of pepper",
            am: "የተጠበሰ ዶሮ በለስላሳ ቶርቲያ ውስጥ፣ ከተከተፈ ቲማቲም፣ ከሽንኩርት እና ከትንሽ ቁንዶ በርበሬ ጋር",
          },
          priceSantim: placeholderEtb(390),
        },
        {
          name: { en: "Veggie Wrap", am: "የአትክልት ራፕ" },
          description: {
            en: "A colorful assortment of fresh vegetables wrapped in a warm tortilla",
            am: "ልዩ ልዩ ትኩስ አትክልቶች በሞቀ ቶርቲያ የተጠቀለሉ",
          },
          priceSantim: placeholderEtb(300),
        },
        {
          name: { en: "Veggie Bagel", am: "የአትክልት ቤግል" },
          description: {
            en: "Fresh vegetables and a touch of pesto on your choice of bagel",
            am: "ትኩስ አትክልቶች እና ትንሽ ፔስቶ በመረጡት ቤግል ላይ",
          },
          priceSantim: placeholderEtb(300),
          optionGroups: [bagelChoice],
        },
      ],
    },
    {
      name: { en: "Pastries", am: "ፓስትሪዎች" },
      dishes: [
        {
          name: { en: "Croissant", am: "ክሮሳን" },
          description: {
            en: "Golden, flaky layers of buttery dough, baked to crisp perfection",
            am: "በቅቤ የተሰራ ወርቃማ ተደራራቢ ሊጥ፣ ቁርጥም እስኪል የተጋገረ",
          },
          priceSantim: placeholderEtb(120),
        },
        {
          name: { en: "Jam Tart", am: "የጃም ታርት" },
          description: {
            en: "A tender shortcrust shell filled with sweet, tangy jam",
            am: "በጣፋጭ እና ኮምጠጥ ባለ ጃም የተሞላ ለስላሳ ቅርፊት",
          },
          priceSantim: placeholderEtb(110),
        },
      ],
    },
    {
      name: { en: "Cakes", am: "ኬኮች" },
      dishes: [
        {
          name: { en: "Opera Cake", am: "ኦፔራ ኬክ" },
          description: {
            en: "Almond sponge soaked in coffee syrup, coffee buttercream and dark chocolate ganache",
            am: "በቡና ሽሮፕ የራሰ የአልሞንድ ኬክ፣ ከቡና ቅቤ ክሬም እና ከጥቁር ቸኮሌት ጋናሽ ጋር",
          },
          priceSantim: placeholderEtb(220),
        },
        {
          name: { en: "Cheese Cake", am: "ቺዝ ኬክ" },
          description: {
            en: "Velvety cream cheese filling over a buttery graham cracker crust",
            am: "በቅቤያማ የብስኩት መሠረት ላይ ለስላሳ የክሬም ቺዝ ሙሌት",
          },
          priceSantim: placeholderEtb(230),
        },
        {
          name: { en: "Tiramisu", am: "ቲራሚሱ" },
          description: {
            en: "Espresso bliss, layered perfection",
            am: "የኤስፕሬሶ ደስታ፣ በጥንቃቄ የተደራረበ",
          },
          priceSantim: placeholderEtb(240),
        },
        {
          name: { en: "Almond Cake", am: "የአልሞንድ ኬክ" },
          description: {
            en: "Buttery almond indulgence",
            am: "በቅቤ የተሰራ ጣፋጭ የአልሞንድ ኬክ",
          },
          priceSantim: placeholderEtb(200),
          photoUrl: "/brands/bilos/almond-cake.webp",
        },
      ],
    },
    {
      name: { en: "Coffee & Tea", am: "ቡና እና ሻይ" },
      dishes: [
        {
          name: { en: "Macchiato", am: "ማኪያቶ" },
          description: {
            en: "Espresso with a dash of milk",
            am: "ኤስፕሬሶ በትንሽ ወተት",
          },
          priceSantim: placeholderEtb(70),
        },
        {
          name: { en: "Vegan Macchiato", am: "የፆም ማኪያቶ" },
          description: {
            en: "Dairy-free macchiato",
            am: "ያለ ወተት ተዋጽኦ የተዘጋጀ ማኪያቶ",
          },
          priceSantim: placeholderEtb(85),
          fasting: true,
        },
        {
          name: { en: "Espresso", am: "ኤስፕሬሶ" },
          description: {
            en: "Strong concentrated coffee",
            am: "ጠንካራ እና የተጣራ ቡና",
          },
          priceSantim: placeholderEtb(60),
        },
        {
          name: { en: "Cappuccino", am: "ካፑቺኖ" },
          description: {
            en: "Espresso with foamed milk",
            am: "ኤስፕሬሶ በአረፋማ ወተት",
          },
          priceSantim: placeholderEtb(90),
          optionGroups: [coffeeExtras],
        },
        {
          name: { en: "Cafe Latte", am: "ካፌ ላቴ" },
          description: {
            en: "Espresso with steamed milk",
            am: "ኤስፕሬሶ በእንፋሎት በሞቀ ወተት",
          },
          priceSantim: placeholderEtb(95),
          optionGroups: [coffeeExtras],
        },
        {
          name: { en: "American Coffee", am: "አሜሪካን ቡና" },
          description: {
            en: "Classic black coffee",
            am: "ክላሲክ ጥቁር ቡና",
          },
          priceSantim: placeholderEtb(70),
        },
        {
          name: { en: "Coffee", am: "ቡና" },
          description: {
            en: "Regular brewed coffee",
            am: "መደበኛ የተፈላ ቡና",
          },
          priceSantim: placeholderEtb(50),
        },
        {
          name: { en: "Hot Chocolate", am: "ትኩስ ቸኮሌት" },
          description: {
            en: "Creamy chocolate drink",
            am: "ክሬማማ የቸኮሌት መጠጥ",
          },
          priceSantim: placeholderEtb(110),
        },
        {
          name: { en: "Tea", am: "ሻይ" },
          description: {
            en: "Traditional black tea",
            am: "ባህላዊ ጥቁር ሻይ",
          },
          priceSantim: placeholderEtb(40),
        },
        {
          name: { en: "Ginger Tea", am: "የዝንጅብል ሻይ" },
          description: {
            en: "Spiced ginger infusion",
            am: "በዝንጅብል የተቀመመ ሻይ",
          },
          priceSantim: placeholderEtb(50),
        },
        {
          name: { en: "Flavored Tea", am: "ጣዕም ያለው ሻይ" },
          description: {
            en: "Herbal tea varieties",
            am: "የተለያዩ የዕፅዋት ሻዮች",
          },
          priceSantim: placeholderEtb(55),
        },
        {
          name: { en: "Special Tea", am: "ስፔሻል ሻይ" },
          description: {
            en: "Premium herbal tea blend",
            am: "ምርጥ የዕፅዋት ሻይ ቅልቅል",
          },
          priceSantim: placeholderEtb(70),
        },
      ],
    },
    {
      name: { en: "Cold Drinks", am: "ቀዝቃዛ መጠጦች" },
      dishes: [
        {
          name: { en: "Iced Latte", am: "አይስድ ላቴ" },
          description: {
            en: "Cold espresso with milk",
            am: "ቀዝቃዛ ኤስፕሬሶ ከወተት ጋር",
          },
          priceSantim: placeholderEtb(130),
          optionGroups: [coffeeExtras],
        },
        {
          name: { en: "Iced Coffee", am: "አይስድ ቡና" },
          description: {
            en: "Chilled coffee beverage",
            am: "የቀዘቀዘ ቡና",
          },
          priceSantim: placeholderEtb(110),
        },
        {
          name: { en: "Mixed Juice", am: "የተቀላቀለ ጁስ" },
          description: {
            en: "Seasonal fruit combination",
            am: "የወቅቱ ፍራፍሬዎች ቅልቅል",
          },
          priceSantim: placeholderEtb(150),
          fasting: true,
        },
        {
          name: { en: "Avocado Juice", am: "የአቮካዶ ጁስ" },
          description: {
            en: "Creamy avocado blend",
            am: "ክሬማማ የአቮካዶ ጭማቂ",
          },
          priceSantim: placeholderEtb(150),
          fasting: true,
        },
        {
          name: { en: "Mango Juice", am: "የማንጎ ጁስ" },
          description: {
            en: "Sweet mango nectar",
            am: "ጣፋጭ የማንጎ ጭማቂ",
          },
          priceSantim: placeholderEtb(140),
          fasting: true,
        },
        {
          name: { en: "Papaya Juice", am: "የፓፓያ ጁስ" },
          description: {
            en: "Tropical papaya drink",
            am: "የሐሩር ፓፓያ መጠጥ",
          },
          priceSantim: placeholderEtb(130),
          fasting: true,
        },
        {
          name: { en: "Pineapple Juice", am: "የአናናስ ጁስ" },
          description: {
            en: "Tangy pineapple refreshment",
            am: "ኮምጠጥ ያለ የሚያነቃቃ የአናናስ ጭማቂ",
          },
          priceSantim: placeholderEtb(140),
          fasting: true,
        },
        {
          name: { en: "Spritz", am: "ስፕሪትዝ" },
          description: {
            en: "Sparkling citrus drink",
            am: "የሚፍለቀለቅ የሎሚ መጠጥ",
          },
          priceSantim: placeholderEtb(160),
        },
        {
          name: { en: "Classic Mojito", am: "ክላሲክ ሞሂቶ" },
          description: {
            en: "Traditional mint lime drink",
            am: "ባህላዊ የናና እና የሎሚ መጠጥ",
          },
          priceSantim: placeholderEtb(170),
        },
        {
          name: { en: "Strawberry Mojito", am: "የእንጆሪ ሞሂቶ" },
          description: {
            en: "Berry-infused mojito",
            am: "በእንጆሪ የተዘጋጀ ሞሂቶ",
          },
          priceSantim: placeholderEtb(180),
        },
        {
          name: { en: "Orange Mojito", am: "የብርቱካን ሞሂቶ" },
          description: {
            en: "Citrus mojito twist",
            am: "የብርቱካን ጣዕም ያለው ሞሂቶ",
          },
          priceSantim: placeholderEtb(180),
        },
        {
          name: { en: "Pineapple Mojito", am: "የአናናስ ሞሂቶ" },
          description: {
            en: "Tropical mojito",
            am: "የሐሩር ፍራፍሬ ሞሂቶ",
          },
          priceSantim: placeholderEtb(180),
        },
        {
          name: { en: "Apple Mojito", am: "የፖም ሞሂቶ" },
          description: {
            en: "Apple mint cocktail",
            am: "የፖም እና የናና ኮክቴል",
          },
          priceSantim: placeholderEtb(180),
        },
        {
          name: { en: "Cinnamon Mojito", am: "የቀረፋ ሞሂቶ" },
          description: {
            en: "Spiced mojito variation",
            am: "በቀረፋ የተቀመመ ሞሂቶ",
          },
          priceSantim: placeholderEtb(180),
        },
        {
          name: { en: "Sunrise Mojito", am: "ሰንራይዝ ሞሂቶ" },
          description: {
            en: "Layered colorful drink",
            am: "ባለ ብዙ ቀለም የተደራረበ መጠጥ",
          },
          priceSantim: placeholderEtb(190),
        },
      ],
    },
  ],
};
