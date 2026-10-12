import { ArgumentMetadata, BadRequestException, PipeTransform } from "@nestjs/common";
import { LoginDto, EmptyDto } from "./auth/auth.dto";
import { CreateUserDto, UpdateUserDto } from "./users/users.dto";

// class-transformer intentionally drops constructor/__proto__; inspect own keys first.
export class RawPayloadPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    const fields = new Map<unknown, string[]>([
      [LoginDto, ["email", "password"]], [EmptyDto, []],
      [CreateUserDto, ["email", "password", "role"]],
      [UpdateUserDto, ["role", "isActive"]],
    ]).get(metadata.metatype);
    if (!fields) return value;
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some(key => !fields.includes(key)) ||
        Object.values(value).some(entry => entry !== null && typeof entry === "object"))
      throw new BadRequestException("Invalid or unknown request field");
    return value;
  }
}
