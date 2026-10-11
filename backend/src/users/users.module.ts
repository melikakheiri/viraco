import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { AssigneesController } from "./assignees.controller";

@Module({
  imports: [AuthModule],
  controllers: [UsersController, AssigneesController],
  providers: [UsersService],
})
export class UsersModule {}
