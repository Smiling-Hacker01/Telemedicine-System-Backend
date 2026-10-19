import { FastifyInstance } from "fastify";
import { searchController } from "./search.controller.js";

export async function searchRoutes(app: FastifyInstance) {
  // Public search endpoint
  app.get("/doctors", searchController.searchDoctors);
}
