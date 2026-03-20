import { IsString, IsOptional, IsBoolean, IsObject, IsArray, IsUrl } from 'class-validator';

export class CreateRuleBodyDto {
  @IsString()
  eventType!: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  browserNotify?: boolean;

  @IsOptional()
  @IsBoolean()
  discordNotify?: boolean;
}

export class UpdateRuleBodyDto {
  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  browserNotify?: boolean;

  @IsOptional()
  @IsBoolean()
  discordNotify?: boolean;
}

export class SetDiscordWebhookDto {
  @IsUrl()
  url!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];
}

export class TestDiscordWebhookDto {
  @IsOptional()
  @IsUrl()
  url?: string;
}

export class UpdateSoundPreferencesDto {
  @IsOptional()
  @IsBoolean()
  kill_sound?: boolean;

  @IsOptional()
  @IsBoolean()
  fight_sound?: boolean;

  @IsOptional()
  @IsBoolean()
  camp_sound?: boolean;

  @IsOptional()
  @IsBoolean()
  roam_sound?: boolean;
}
