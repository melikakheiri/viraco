import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { TasksModule } from "./tasks/tasks.module";
import { entities } from "./database/data-source";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HealthController } from "./health.controller";
import { resolve } from "node:path";

const envFilePaths = [
  resolve(__dirname, "../.env"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "backend/.env"),
];

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TasksModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: envFilePaths }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        installExtensions: false,
        host: config.getOrThrow<string>("DATABASE_HOST"),
        port: Number(config.getOrThrow<string>("DATABASE_PORT")),
        username: config.getOrThrow<string>("DATABASE_USER"),
        password: config.getOrThrow<string>("DATABASE_PASSWORD"),
        database: config.getOrThrow<string>("DATABASE_NAME"),
        entities,
        autoLoadEntities: true,
        synchronize: false,
        migrations: [resolve(__dirname, "database/migrations/*{.js,.ts}")],
      }),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
