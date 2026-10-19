// provider 契约：能力声明 + 只做上游到统一模型的映射。

import type {
  AlbumDetail,
  ArtistDetail,
  Lyric,
  PlaylistDetail,
  Quality,
  RankDetail,
  RankItem,
  SearchPage,
  Song,
  SongDetail,
  SongUrl,
  Source,
} from '../core/model.ts';

export type Capability = 'search' | 'song' | 'url' | 'lyric' | 'album' | 'artist' | 'playlist' | 'rank';

export interface Provider {
  source: Source;
  capability: Record<Capability, boolean>;
  search(q: string, page: number, size: number): Promise<SearchPage>;
  song(id: string): Promise<SongDetail>;
  url(id: string, quality: Quality): Promise<SongUrl>;
  /** 可选批量取地址；返回 id -> SongUrl | null（null 表示不可播） */
  urls?(ids: string[], quality: Quality): Promise<Map<string, SongUrl | null>>;
  lyric(id: string): Promise<Lyric>;
  album?(id: string): Promise<AlbumDetail>;
  artist?(id: string): Promise<ArtistDetail>;
  playlist?(id: string, page: number, size: number): Promise<PlaylistDetail>;
  rankList?(): Promise<RankItem[]>;
  rank?(id: string): Promise<RankDetail>;
}

export type { Song };
