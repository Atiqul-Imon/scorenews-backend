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
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  namespace: '/live',
  transports: ['websocket', 'polling'], // Explicitly allow both transports
  allowEIO3: true, // Allow Engine.IO v3 clients
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private readonly connectedClients = new Map<string, Socket>();
  private matchUpdateIntervals = new Map<string, NodeJS.Timeout>();
  // Track how many clients are watching each match
  private matchViewerCount = new Map<string, number>();

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
    
    // Note: We don't clean up intervals here because:
    // 1. Socket.IO automatically removes client from rooms on disconnect
    // 2. Viewer count will be decremented naturally
    // 3. Intervals will clean up when viewer count reaches 0
    // This prevents issues if client reconnects quickly
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
    const matchKey = `match:${sport}:${matchId}`;
    
    this.logger.log(`Client ${client.id} subscribed to match ${matchId} (${sport})`);

    // Join room for this match
    client.join(matchKey);

    // Increment viewer count for this match
    const currentViewers = this.matchViewerCount.get(matchKey) || 0;
    this.matchViewerCount.set(matchKey, currentViewers + 1);
    this.logger.log(`Match ${matchId} now has ${currentViewers + 1} viewer(s)`);

    // Send initial match data
    try {
      const match = sport === 'cricket'
        ? await this.cricketService.getMatchById(matchId)
        : await this.footballService.getMatchById(matchId);

      client.emit('match-update', match);

      // Only create interval if this is the first viewer (optimize API calls)
      if (currentViewers === 0) {
        this.logger.log(`Starting update interval for match ${matchId} (first viewer)`);
        
        // Set up periodic updates for this match (every 15 seconds to reduce API calls)
        const interval = setInterval(async () => {
          try {
            // Check if there are still viewers (clean up if none)
            const viewers = this.matchViewerCount.get(matchKey) || 0;
            if (viewers === 0) {
              this.logger.log(`No viewers for match ${matchId}, stopping updates`);
              clearInterval(interval);
              this.matchUpdateIntervals.delete(matchKey);
              return;
            }

            // Fetch match data ONCE and broadcast to all viewers
            const match = sport === 'cricket'
              ? await this.cricketService.getMatchById(matchId)
              : await this.footballService.getMatchById(matchId);

            // Broadcast to all clients in the room
            this.server.to(matchKey).emit('match-update', match);
            this.logger.log(`Broadcasted update for match ${matchId} to ${viewers} viewer(s)`);
          } catch (error) {
            this.logger.error(`Error updating match ${matchId}`, error);
          }
        }, 15000); // 15 seconds - balance between real-time and API cost

        this.matchUpdateIntervals.set(matchKey, interval);
      }
    } catch (error) {
      this.logger.error(`Error fetching match ${matchId}`, error);
      client.emit('error', { message: 'Failed to fetch match data' });
      // Decrement viewer count on error
      this.matchViewerCount.set(matchKey, Math.max(0, (this.matchViewerCount.get(matchKey) || 0) - 1));
    }
  }

  @SubscribeMessage('unsubscribe:match')
  handleUnsubscribeMatch(@ConnectedSocket() client: Socket, @MessageBody() data: { matchId: string; sport: 'cricket' | 'football' }) {
    const { matchId, sport } = data;
    const matchKey = `match:${sport}:${matchId}`;
    
    this.logger.log(`Client ${client.id} unsubscribed from match ${matchId} (${sport})`);

    client.leave(matchKey);

    // Decrement viewer count
    const currentViewers = this.matchViewerCount.get(matchKey) || 0;
    const newViewerCount = Math.max(0, currentViewers - 1);
    this.matchViewerCount.set(matchKey, newViewerCount);
    this.logger.log(`Match ${matchId} now has ${newViewerCount} viewer(s)`);

    // Only clear interval if no viewers left (optimize API calls)
    if (newViewerCount === 0) {
      const interval = this.matchUpdateIntervals.get(matchKey);
      if (interval) {
        this.logger.log(`Stopping update interval for match ${matchId} (no viewers)`);
        clearInterval(interval);
        this.matchUpdateIntervals.delete(matchKey);
      }
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
