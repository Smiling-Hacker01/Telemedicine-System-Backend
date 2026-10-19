import { FastifyRequest, FastifyReply } from 'fastify';
import { doctorsService, DoctorsService } from './doctors.service.js';
import {
  createDoctorProfileSchema,
  updateDoctorProfileSchema,
  verifyDoctorSchema,
} from './doctors.schemas.js';

export class DoctorsController {
  constructor(private service: DoctorsService = doctorsService) {}

  createProfile = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const input = createDoctorProfileSchema.parse(request.body);
    const doctor = await this.service.createProfile(
      userId,
      input,
      request.ip,
      request.headers['user-agent'],
      request.correlationId
    );

    return reply.status(201).send({
      success: true,
      message: 'Doctor profile created successfully',
      data: { doctor },
      correlationId: request.correlationId,
    });
  };

  getMyProfile = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const doctor = await this.service.getProfileByUserId(userId);

    return reply.status(200).send({
      success: true,
      data: { doctor },
      correlationId: request.correlationId,
    });
  };

  getDoctorById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const doctor = await this.service.getDoctorById(id);

    return reply.status(200).send({
      success: true,
      data: { doctor },
      correlationId: request.correlationId,
    });
  };

  updateMyProfile = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const input = updateDoctorProfileSchema.parse(request.body);
    const doctor = await this.service.updateProfile(userId, input);

    return reply.status(200).send({
      success: true,
      message: 'Doctor profile updated successfully',
      data: { doctor },
      correlationId: request.correlationId,
    });
  };

  verifyDoctor = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const adminId = request.user!.userId;
    const input = verifyDoctorSchema.parse(request.body);
    const doctor = await this.service.verifyDoctor(adminId, id, input);

    return reply.status(200).send({
      success: true,
      message: `Doctor status updated to ${input.isVerified ? 'verified' : 'unverified'}`,
      data: { doctor },
      correlationId: request.correlationId,
    });
  };
}

export const doctorsController = new DoctorsController();
