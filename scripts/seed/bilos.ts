import type { MenuInput } from "@/core";

/** The seeded Lancha venue's Venue Link is /v/bilos-lancha. */
export const LANCHA_LINK_TOKEN = "bilos-lancha";

// Dish names and descriptions are Bilo's own, from bilospastry.com (menu and home pages, Nov 2026).
// PLACEHOLDER PRICES: Bilo's website shows no prices. Every price below is invented for
// development and must be replaced with Bilo's real prices before the pilot.
const placeholderEtb = (birr: number) => birr * 100;

export const bilosMenu: MenuInput = {
  sections: [
    {
      name: "Breakfast",
      dishes: [
        { name: "Omelette", description: "Start with our classic omelette and add your choice of extras", priceSantim: placeholderEtb(240) },
        { name: "Scrambled Eggs", description: "Made with fresh, locally sourced eggs", priceSantim: placeholderEtb(210) },
        { name: "Chechebsa", description: "Spiced flatbread with a side of honey", priceSantim: placeholderEtb(230) },
        { name: "French Toast", description: "Thick slices of our freshly baked brioche, soaked and griddled to golden perfection", priceSantim: placeholderEtb(260) },
        { name: "Pancake with Syrup", description: "A timeless breakfast favorite", priceSantim: placeholderEtb(250) },
        { name: "Waffle", description: "Golden and irresistibly crisp", priceSantim: placeholderEtb(250) },
        { name: "Avocado Toast", description: "Ripe avocado, lightly seasoned, on your choice of toast", priceSantim: placeholderEtb(280) },
        { name: "Bread Spread", description: "Freshly baked bagel or croissant, served with a side of jam and cream cheese", priceSantim: placeholderEtb(220) },
        { name: "Oatmeal", description: "Warm and comforting, a classic breakfast", priceSantim: placeholderEtb(190) },
        { name: "Vegan Oatmeal", description: "Simple and wholesome, cooked in water", priceSantim: placeholderEtb(180) },
      ],
    },
    {
      name: "Sandwiches & Wraps",
      dishes: [
        { name: "Egg Sandwich", description: "A classic breakfast sandwich with perfectly cooked eggs", priceSantim: placeholderEtb(260) },
        { name: "Egg Croissant Sandwich", description: "Flaky croissant filled with fluffy eggs", priceSantim: placeholderEtb(290) },
        { name: "Tuna Sandwich", description: "Flaked tuna and fresh vegetable toppings on a bagel bread of your choice", priceSantim: placeholderEtb(380) },
        { name: "Salmon Sandwich", description: "Smoked salmon, cream cheese, cucumber, tomato and a touch of onion on a freshly baked bagel", priceSantim: placeholderEtb(520) },
        { name: "Steak Sandwich", description: "Savory grilled steak on a fresh, toasted roll", priceSantim: placeholderEtb(480) },
        { name: "Chicken Wrap", description: "Grilled chicken in a soft tortilla with diced tomato, sliced onion and a touch of pepper", priceSantim: placeholderEtb(390) },
        { name: "Veggie Wrap", description: "A colorful assortment of fresh vegetables wrapped in a warm tortilla", priceSantim: placeholderEtb(300) },
        { name: "Veggie Bagel", description: "Fresh vegetables and a touch of pesto on your choice of bagel", priceSantim: placeholderEtb(300) },
      ],
    },
    {
      name: "Pastries",
      dishes: [
        { name: "Croissant", description: "Golden, flaky layers of buttery dough, baked to crisp perfection", priceSantim: placeholderEtb(120) },
        { name: "Jam Tart", description: "A tender shortcrust shell filled with sweet, tangy jam", priceSantim: placeholderEtb(110) },
      ],
    },
    {
      name: "Cakes",
      dishes: [
        { name: "Opera Cake", description: "Almond sponge soaked in coffee syrup, coffee buttercream and dark chocolate ganache", priceSantim: placeholderEtb(220) },
        { name: "Cheese Cake", description: "Velvety cream cheese filling over a buttery graham cracker crust", priceSantim: placeholderEtb(230) },
        { name: "Tiramisu", description: "Espresso bliss, layered perfection", priceSantim: placeholderEtb(240) },
        { name: "Almond Cake", description: "Buttery almond indulgence", priceSantim: placeholderEtb(200) },
      ],
    },
    {
      name: "Coffee & Tea",
      dishes: [
        { name: "Macchiato", description: "Espresso with a dash of milk", priceSantim: placeholderEtb(70) },
        { name: "Vegan Macchiato", description: "Dairy-free macchiato", priceSantim: placeholderEtb(85) },
        { name: "Espresso", description: "Strong concentrated coffee", priceSantim: placeholderEtb(60) },
        { name: "Cappuccino", description: "Espresso with foamed milk", priceSantim: placeholderEtb(90) },
        { name: "Cafe Latte", description: "Espresso with steamed milk", priceSantim: placeholderEtb(95) },
        { name: "American Coffee", description: "Classic black coffee", priceSantim: placeholderEtb(70) },
        { name: "Coffee", description: "Regular brewed coffee", priceSantim: placeholderEtb(50) },
        { name: "Hot Chocolate", description: "Creamy chocolate drink", priceSantim: placeholderEtb(110) },
        { name: "Tea", description: "Traditional black tea", priceSantim: placeholderEtb(40) },
        { name: "Ginger Tea", description: "Spiced ginger infusion", priceSantim: placeholderEtb(50) },
        { name: "Flavored Tea", description: "Herbal tea varieties", priceSantim: placeholderEtb(55) },
        { name: "Special Tea", description: "Premium herbal tea blend", priceSantim: placeholderEtb(70) },
      ],
    },
    {
      name: "Cold Drinks",
      dishes: [
        { name: "Iced Latte", description: "Cold espresso with milk", priceSantim: placeholderEtb(130) },
        { name: "Iced Coffee", description: "Chilled coffee beverage", priceSantim: placeholderEtb(110) },
        { name: "Mixed Juice", description: "Seasonal fruit combination", priceSantim: placeholderEtb(150) },
        { name: "Avocado Juice", description: "Creamy avocado blend", priceSantim: placeholderEtb(150) },
        { name: "Mango Juice", description: "Sweet mango nectar", priceSantim: placeholderEtb(140) },
        { name: "Papaya Juice", description: "Tropical papaya drink", priceSantim: placeholderEtb(130) },
        { name: "Pineapple Juice", description: "Tangy pineapple refreshment", priceSantim: placeholderEtb(140) },
        { name: "Spritz", description: "Sparkling citrus drink", priceSantim: placeholderEtb(160) },
        { name: "Classic Mojito", description: "Traditional mint lime drink", priceSantim: placeholderEtb(170) },
        { name: "Strawberry Mojito", description: "Berry-infused mojito", priceSantim: placeholderEtb(180) },
        { name: "Orange Mojito", description: "Citrus mojito twist", priceSantim: placeholderEtb(180) },
        { name: "Pineapple Mojito", description: "Tropical mojito", priceSantim: placeholderEtb(180) },
        { name: "Apple Mojito", description: "Apple mint cocktail", priceSantim: placeholderEtb(180) },
        { name: "Cinnamon Mojito", description: "Spiced mojito variation", priceSantim: placeholderEtb(180) },
        { name: "Sunrise Mojito", description: "Layered colorful drink", priceSantim: placeholderEtb(190) },
      ],
    },
  ],
};
