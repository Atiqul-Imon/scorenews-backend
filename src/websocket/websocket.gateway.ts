import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { CricketService } from '../modules/cricket/cricket.service';
import { FootballService } from '../modules/football/football.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/live',
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private readonly connectedClients = new Map<string, Socket>();
  private matchUpdateIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private cricketService: CricketService,
    private footballService: FootballService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
    
    // Clean up intervals for this client
    this.matchUpdateIntervals.forEach((interval, matchId) => {
      clearInterval(interval);
      this.matchUpdateIntervals.delete(matchId);
    });
  }

  @SubscribeMessage('subscribe:live-matches')
  async handleSubscribeLiveMatches(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client ${client.id} subscribed to live matches`);
    
    // Send initial live matches
    try {
      const [cricketMatches, footballMatches] = await Promise.all([
        this.cricketService.getLiveMatches(),
        this.footballService.getLiveMatches(),
      ]);

      client.emit('live-matches', {
        cricket: cricketMatches,
        football: footballMatches,
      });

      // Set up periodic updates (every 30 seconds)
      const interval = setInterval(async () => {
        try {
          const [cricket, football] = await Promise.all([
            this.cricketService.getLiveMatches(),
            this.footballService.getLiveMatches(),
          ]);

          client.emit('live-matches-update', {
            cricket,
            football,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.error('Error updating live matches', error);
        }
      }, 30000);

      // Store interval for cleanup
      this.matchUpdateIntervals.set(client.id, interval);
    } catch (error) {
      this.logger.error('Error fetching live matches', error);
      client.emit('error', { message: 'Failed to fetch live matches' });
    }
  }

  @SubscribeMessage('subscribe:match')
  async handleSubscribeMatch(@ConnectedSocket() client: Socket, @MessageBody() data: { matchId: string; sport: 'cricket' | 'football' }) {
    const { matchId, sport } = data;
    this.logger.log(`Client ${client.id} subscribed to match ${matchId} (${sport})`);

    // Join room for this match
    client.join(`match:${sport}:${matchId}`);

    // Send initial match data
    try {
      const match = sport === 'cricket'
        ? await this.cricketService.getMatchById(matchId)
        : await this.footballService.getMatchById(matchId);

      client.emit('match-update', match);

      // Set up periodic updates for this match (every 10 seconds)
      const interval = setInterval(async () => {
        try {
          const match = sport === 'cricket'
            ? await this.cricketService.getMatchById(matchId)
            : await this.footballService.getMatchById(matchId);

          this.server.to(`match:${sport}:${matchId}`).emit('match-update', match);
        } catch (error) {
          this.logger.error(`Error updating match ${matchId}`, error);
        }
      }, 10000);

      this.matchUpdateIntervals.set(`match:${sport}:${matchId}`, interval);
    } catch (error) {
      this.logger.error(`Error fetching match ${matchId}`, error);
      client.emit('error', { message: 'Failed to fetch match data' });
    }
  }

  @SubscribeMessage('unsubscribe:match')
  handleUnsubscribeMatch(@ConnectedSocket() client: Socket, @MessageBody() data: { matchId: string; sport: 'cricket' | 'football' }) {
    const { matchId, sport } = data;
    this.logger.log(`Client ${client.id} unsubscribed from match ${matchId} (${sport})`);

    client.leave(`match:${sport}:${matchId}`);

    // Clear interval
    const intervalKey = `match:${sport}:${matchId}`;
    const interval = this.matchUpdateIntervals.get(intervalKey);
    if (interval) {
      clearInterval(interval);
      this.matchUpdateIntervals.delete(intervalKey);
    }
  }

  // Broadcast match update to all clients in a match room
  broadcastMatchUpdate(sport: 'cricket' | 'football', matchId: string, matchData: any) {
    this.server.to(`match:${sport}:${matchId}`).emit('match-update', matchData);
  }

  // Broadcast live matches update to all subscribed clients
  broadcastLiveMatchesUpdate(cricketMatches: any[], footballMatches: any[]) {
    this.server.emit('live-matches-update', {
      cricket: cricketMatches,
      football: footballMatches,
      timestamp: new Date().toISOString(),
    });
  }
}
