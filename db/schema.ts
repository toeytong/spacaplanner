import { real, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const eventSpaces = sqliteTable("event_spaces", {
  spaceId: text("space_id").primaryKey(),
  area: real("area"),
  shopName: text("shop_name").notNull().default(""),
  category: text("category").notNull().default(""),
  status: text("status").notNull().default("available"),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  contact: text("contact").notNull().default(""),
  notes: text("notes").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export const plannerStates = sqliteTable("planner_states", {
  id: integer("id").primaryKey(),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().default(""),
});

export const userPlannerStates = sqliteTable("user_planner_states", {
  userId: text("user_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().default(""),
});
