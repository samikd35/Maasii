import type { MenuInput } from "@/core";

export const SABA_LINK_TOKEN = "saba-bole";

export const sabaMenu: MenuInput = {
  sections: [
    {
      name: { en: "Coffee & Tea", am: "ቡና እና ሻይ" },
      dishes: [
        {
          name: { en: "Buna", am: "ቡና" },
          description: { en: "Freshly roasted Ethiopian coffee", am: "አዲስ የተቆላ የኢትዮጵያ ቡና" },
          priceSantim: 10_000,
        },
      ],
    },
  ],
};
