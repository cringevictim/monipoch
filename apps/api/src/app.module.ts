import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import appConfig from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { KillmailModule } from './modules/killmail/killmail.module';
import { FightDetectionModule } from './modules/fight-detection/fight-detection.module';
import { WebsocketModule } from './websocket/websocket.module';
import { BackfillModule } from './modules/backfill/backfill.module';
import { HostileProfileModule } from './modules/hostile-profile/hostile-profile.module';
import { TacticalIntelModule } from './modules/tactical-intel/tactical-intel.module';
import { PVEIntelModule } from './modules/pve-intel/pve-intel.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PochvenToolsModule } from './modules/pochven-tools/pochven-tools.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MapController } from './modules/map/map.controller';
import { MapService } from './modules/map/map.service';
import { DebugController } from './modules/debug/debug.controller';
import { HealthController } from './common/health.controller';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: 100,
    }]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    TerminusModule,
    DatabaseModule,
    AuthModule,
    KillmailModule,
    FightDetectionModule,
    WebsocketModule,
    BackfillModule,
    HostileProfileModule,
    TacticalIntelModule,
    PVEIntelModule,
    NotificationModule,
    PochvenToolsModule,
    AnalyticsModule,
  ],
  controllers: [MapController, DebugController, HealthController],
  providers: [
    MapService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
