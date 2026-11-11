import {
  acceptInvitation,
  addBrandOwner,
  addTables,
  createBrand,
  createVenue,
  inviteManager,
  publicActor,
  publishMenu,
  staffActor,
  systemActor,
  type Brand,
  type MenuInput,
  type PublishedMenuVersion,
  type Table,
  type Venue,
} from "@/core";
import { createStaffUser, TEST_PASSWORD, uniqueEmail, type TestUser } from "./users";

/**
 * Builds a fresh, isolated tenant through the Maasii core: a Brand with its Owner, Venues with
 * Tables, Managers, and optionally a published Menu. Every call creates new rows, so tests never
 * share data.
 *
 *   const s = await scenario().brand("Bilo's").venue("Lancha", { tables: 16 }).manager("Hana").publishedMenu().build();
 *
 * Later tickets add steps here (waiters, shifts, orders) rather than writing rows by hand.
 */
export function scenario() {
  return new ScenarioBuilder();
}

export type ScenarioVenue = Venue & { tables: Table[] };

export type Scenario = {
  brand: Brand;
  owner: TestUser;
  /** The first Venue added (a "Lancha" Venue with tables 1-16 if none was added). */
  venue: ScenarioVenue;
  venues: Record<string, ScenarioVenue>;
  /** Managers by name. Each accepted an Owner's invitation and can sign in with `TEST_PASSWORD`. */
  managers: Record<string, TestUser>;
  /** The Menu version published by `.publishedMenu()`, if it was called. */
  menu: PublishedMenuVersion | null;
  /** The stable id of a published dish, looked up by name. */
  dishId(name: string): string;
};

export const sampleMenu: MenuInput = {
  sections: [
    {
      name: "Breakfast",
      dishes: [
        { name: "Omelette", description: "Our classic omelette", priceSantim: 22_000 },
        { name: "Chechebsa", description: "Spiced flatbread with a side of honey", priceSantim: 19_000 },
      ],
    },
    {
      name: "Drinks",
      dishes: [{ name: "Macchiato", description: "Espresso with a dash of milk", priceSantim: 6_000 }],
    },
  ],
};

class ScenarioBuilder {
  private brandName = "Test Brand";
  private venuePlans: { name: string; tables: number }[] = [];
  private managerPlans: { name: string; venue?: string }[] = [];
  private menuToPublish: MenuInput | null = null;

  brand(name: string) {
    this.brandName = name;
    return this;
  }

  /** Adds a Venue with tables numbered 1 to `tables`. */
  venue(name: string, { tables = 16 }: { tables?: number } = {}) {
    this.venuePlans.push({ name, tables });
    return this;
  }

  /** Adds a Manager, invited by the Owner, at the named Venue (the first Venue by default). */
  manager(name: string, { venue }: { venue?: string } = {}) {
    this.managerPlans.push({ name, venue });
    return this;
  }

  publishedMenu(menu: MenuInput = sampleMenu) {
    this.menuToPublish = menu;
    return this;
  }

  async build(): Promise<Scenario> {
    const brand = await createBrand(systemActor, { name: this.brandName });
    const owner = await createStaffUser("owner");
    await addBrandOwner(systemActor, { brandId: brand.id, userId: owner.userId });

    const plans = this.venuePlans.length > 0 ? this.venuePlans : [{ name: "Lancha", tables: 16 }];
    const venues: Record<string, ScenarioVenue> = {};
    for (const plan of plans) {
      const venue = await createVenue(systemActor, { brandId: brand.id, name: plan.name });
      const numbers = Array.from({ length: plan.tables }, (_, i) => i + 1);
      const tables = await addTables(systemActor, { venueId: venue.id, numbers });
      venues[plan.name] = { ...venue, tables };
    }

    const managers: Record<string, TestUser> = {};
    for (const plan of this.managerPlans) {
      const venue = venues[plan.venue ?? plans[0].name];
      if (!venue) throw new Error(`No venue called "${plan.venue}" in this scenario.`);
      const email = uniqueEmail(plan.name);
      const { token } = await inviteManager(owner.actor, { venueId: venue.id, name: plan.name, contact: email });
      const { userId } = await acceptInvitation(publicActor, { token, password: TEST_PASSWORD });
      managers[plan.name] = { userId, email, password: TEST_PASSWORD, actor: staffActor(userId) };
    }

    const menu = this.menuToPublish
      ? await publishMenu(owner.actor, { brandId: brand.id, menu: this.menuToPublish })
      : null;

    return {
      brand,
      owner,
      venue: venues[plans[0].name],
      venues,
      managers,
      menu,
      dishId(name) {
        const dish = menu?.sections.flatMap((s) => s.dishes).find((d) => d.name === name);
        if (!dish) throw new Error(`No published dish called "${name}" in this scenario.`);
        return dish.dishId;
      },
    };
  }
}
