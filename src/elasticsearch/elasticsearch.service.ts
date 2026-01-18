import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  private client: Client;

  constructor(private configService: ConfigService) {
    const elasticsearchUrl = this.configService.get<string>(
      'ELASTICSEARCH_URL',
      'http://localhost:9200',
    );

    this.client = new Client({
      node: elasticsearchUrl,
      maxRetries: 3,
      requestTimeout: 30000,
    });
  }

  async onModuleInit() {
    try {
      const health = await this.client.cluster.health();
      console.log('Elasticsearch connected:', health.status);
    } catch (error) {
      console.warn('Elasticsearch connection failed:', error.message);
    }
  }

  async onModuleDestroy() {
    // Elasticsearch client doesn't need explicit cleanup
  }

  getClient(): Client {
    return this.client;
  }

  async index(index: string, id: string, document: any): Promise<any> {
    return this.client.index({
      index,
      id,
      document,
    });
  }

  async search(index: string, query: any): Promise<any> {
    return this.client.search({
      index,
      body: query,
    });
  }

  async delete(index: string, id: string): Promise<any> {
    return this.client.delete({
      index,
      id,
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  async indexDocument(index: string, id: string, document: any): Promise<any> {
    return this.index(index, id, document);
  }

  async deleteDocument(index: string, id: string): Promise<any> {
    return this.delete(index, id);
  }

  async searchContent(query: string, filters: any = {}, size: number = 20, from: number = 0): Promise<any> {
    const searchBody = {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: query,
                fields: ['title^2', 'content'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
          ],
          filter: [
            { term: { status: 'approved' } },
            ...Object.entries(filters).map(([key, value]) => ({ term: { [key]: value } })),
          ],
        },
      },
      sort: [
        { publishedAt: { order: 'desc' } },
        { _score: { order: 'desc' } },
      ],
      size,
      from,
    };

    const response = await this.search('content', searchBody);
    return {
      hits: response.hits.hits.map((hit: any) => ({
        ...hit._source,
        score: hit._score,
      })),
      total: response.hits.total.value,
      took: response.took,
    };
  }
}

