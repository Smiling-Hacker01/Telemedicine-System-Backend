import { FastifyRequest, FastifyReply } from 'fastify';
import { searchService, SearchService } from './search.service.js';
import { searchDoctorsSchema } from './search.schemas.js';

export class SearchController {
  constructor(private service: SearchService = searchService) {}

  searchDoctors = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = searchDoctorsSchema.parse(request.query);
    const result = await this.service.searchDoctors(input);

    return reply.status(200).send({
      success: true,
      data: result.items,
      meta: result.meta,
      correlationId: request.correlationId,
    });
  };
}

export const searchController = new SearchController();
