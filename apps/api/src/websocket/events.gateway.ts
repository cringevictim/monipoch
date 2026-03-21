import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, WebSocket } from 'ws';
import { WsEventType, type WsKillEvent, type WsFightEvent, type WsHeatmapUpdate, type WsNotificationEvent, type WsPilotLocationsEvent, type PilotPresence } from '@monipoch/shared';
import type { ESIKillmail, ZKBMetadata } from '@monipoch/shared';

interface ExtendedSocket extends WebSocket {
  subscribedSystems?: Set<number>;
  isAlive?: boolean;
  pongHandler?: () => void;
}

@WebSocketGateway({ path: '/ws' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  private clients = new Set<ExtendedSocket>();

  handleConnection(client: ExtendedSocket) {
    client.subscribedSystems = new Set();
    client.isAlive = true;
    this.clients.add(client);
    this.logger.debug(`Client connected (${this.clients.size} total)`);

    client.pongHandler = () => { client.isAlive = true; };
    client.on('pong', client.pongHandler);
  }

  handleDisconnect(client: ExtendedSocket) {
    if (client.pongHandler) {
      client.removeListener('pong', client.pongHandler);
    }
    this.clients.delete(client);
    this.logger.debug(`Client disconnected (${this.clients.size} total)`);
  }

  onModuleDestroy() {
    for (const client of this.clients) {
      if (client.pongHandler) client.removeListener('pong', client.pongHandler);
      client.close();
    }
    this.clients.clear();
  }

  @SubscribeMessage('subscribe_system')
  handleSubscribeSystem(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() data: { systemId: number },
  ) {
    client.subscribedSystems?.add(data.systemId);
    return { event: 'subscribed', data: { systemId: data.systemId } };
  }

  @SubscribeMessage('unsubscribe_system')
  handleUnsubscribeSystem(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() data: { systemId: number },
  ) {
    client.subscribedSystems?.delete(data.systemId);
    return { event: 'unsubscribed', data: { systemId: data.systemId } };
  }

  @OnEvent('killmail.pochven')
  handlePochvenKill(payload: {
    killmail: ESIKillmail;
    zkb: ZKBMetadata;
    systemName: string;
  }) {
    const killTime = new Date(payload.killmail.killmail_time).getTime();
    if (Date.now() - killTime > 20 * 60 * 1000) return;

    const event: WsKillEvent = {
      type: WsEventType.KILL_NEW,
      killmail: payload.killmail,
      zkb: payload.zkb,
      systemName: payload.systemName,
    };

    this.broadcast(JSON.stringify(event));
  }

  @OnEvent('fight.update')
  handleFightUpdate(payload: { type: string; fight: any }) {
    const event: WsFightEvent = {
      type: payload.type as any,
      fight: payload.fight,
    };
    this.broadcast(JSON.stringify(event));
  }

  @OnEvent('notification.push')
  handleNotificationPush(payload: {
    userId: number;
    eventType: string;
    description: string;
  }) {
    const event: WsNotificationEvent = {
      type: WsEventType.NOTIFICATION,
      eventType: payload.eventType,
      title: this.getNotificationTitle(payload.eventType),
      description: payload.description,
    };
    this.broadcast(JSON.stringify(event));
  }

  private getNotificationTitle(eventType: string): string {
    switch (eventType) {
      case 'killmail.pochven': return 'Pochven Kill';
      case 'fight.update': return 'Fight Update';
      case 'camp.detected': return 'Gate Camp Detected';
      case 'roam.tracked': return 'Roam Tracked';
      default: return 'Intel Alert';
    }
  }

  broadcastHeatmap(data: WsHeatmapUpdate) {
    this.broadcast(JSON.stringify(data));
  }

  @OnEvent('pilot.locations')
  handlePilotLocations(payload: { pilots: PilotPresence[] }) {
    const event: WsPilotLocationsEvent = {
      type: WsEventType.PILOT_LOCATIONS,
      pilots: payload.pilots,
    };
    this.broadcast(JSON.stringify(event));
  }

  private broadcast(message: string) {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
