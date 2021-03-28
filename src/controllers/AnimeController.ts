import { NextFunction, Request, Response } from 'express';
import { requestGot } from '../utils/requestCall';
import { animeFlvInfo, jkanimeInfo, videoServersJK } from '../utils/util';
import { transformUrlServer } from '../utils/transformerUrl';
import AnimeModel, { Anime as ModelA } from '../database/models/anime.model';
import util from 'util';
import { hashStringMd5 } from '../utils/util';
import {
  animeExtraInfo,
  getAnimeVideoPromo,
  getAnimeCharacters,
  getRelatedAnimesFLV,
  getRelatedAnimesMAL,
} from '../utils/util';
import urls from '../utils/urls';
import { redisClient } from '../database/connection';

// @ts-ignore
redisClient.get = util.promisify(redisClient.get);

/*
  AnimeController - a class to manage the schedule,
  top, all the animes, return the last episodes
  with async to return promises.
*/

interface Schedule {
  title: string;
  mal_id: number;
  image_url: any;
}

interface Anime {
  index: string;
  animeId: string;
  title: string;
  id: string;
  type: string;
}

interface Top {
  rank: string;
  title: string;
  url: string;
  image_url: string;
  type: string;
  subtype: string;
  page: number;
  score: string;
}

interface Episode {
  id: string;
  title: string;
  image: string;
  episode: number;
  servers: { id: string; url: string; direct: boolean };
}

interface Movie {
  id: string;
  title: string;
  type: string;
  page: string;
  banner: string;
  image: string;
  synopsis: string;
  status: string;
  rate: string;
  genres: string[];
  episodes: object[];
}

export default class AnimeController {
  async schedule(req: Request, res: Response, next: NextFunction) {
    const { day } = req.params;
    let data: any;

    try {
      const resultQueryRedis: any = await redisClient.get(
        `schedule_${hashStringMd5(day)}`,
      );

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        data = await requestGot(`${urls.BASE_JIKAN}schedule/${day}`, {
          parse: true,
          scrapy: false,
        });
      }
    } catch (err) {
      return next(err);
    }

    const animeList: Schedule[] = data[day].map((item: Schedule) => ({
      title: item.title,
      malid: item.mal_id,
      image: item.image_url,
    }));

    if (animeList.length > 0) {
      /* Set the key in the redis cache. */

      redisClient.set(
        `schedule_${hashStringMd5(day)}`,
        JSON.stringify({ day: animeList }),
      );

      /* After 24hrs expire the key. */

      redisClient.expireat(
        `schedule_${hashStringMd5(day)}`,
        new Date().getTime() + 86400000,
      );

      res.status(200).json({
        day: animeList,
      });
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async top(req: Request, res: Response, next: NextFunction) {
    const { type, subtype, page } = req.params;
    let data: any;

    try {
      let resultQueryRedis: any;

      if (subtype) {
        resultQueryRedis = await redisClient.get(
          `top_${hashStringMd5(`${type}:${subtype}:${page}`)}`,
        );
      } else {
        resultQueryRedis = await redisClient.get(
          `top_${hashStringMd5(`${type}:${page}`)}`,
        );
      }

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        if (subtype !== undefined) {
          data = await requestGot(
            `${urls.BASE_JIKAN}top/${type}/${page}/${subtype}`,
            { parse: true, scrapy: false },
          );
        } else {
          data = await requestGot(`${urls.BASE_JIKAN}top/${type}/${page}`, {
            parse: true,
            scrapy: false,
          });
        }
      }
    } catch (err) {
      return next(err);
    }

    const top: Top[] = data.top.map((item: Top) => ({
      rank: item.rank,
      title: item.title,
      url: item.url,
      image_url: item.image_url,
      type: type,
      subtype: subtype,
      page: page,
      score: item.score,
    }));

    if (top.length > 0) {
      /* Set the key in the redis cache. */
      if (subtype) {
        redisClient.set(
          `top_${hashStringMd5(`${type}:${subtype}:${page}`)}`,
          JSON.stringify({ top }),
        );
      } else {
        redisClient.set(
          `top_${hashStringMd5(`${type}:${page}`)}`,
          JSON.stringify({ top }),
        );
      }

      /* After 24hrs expire the key. */

      if (subtype) {
        redisClient.expireat(
          `top_${hashStringMd5(`${type}:${subtype}:${page}`)}`,
          new Date().getTime() + 86400000,
        );
      } else {
        redisClient.expireat(
          `top_${hashStringMd5(`${type}:${page}`)}`,
          new Date().getTime() + 86400000,
        );
      }

      return res.status(200).json({ top });
    } else {
      return res.status(400).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async getAllAnimes(req: Request, res: Response, next: NextFunction) {
    let data: any;

    try {
      data = await requestGot(`${urls.BASE_ANIMEFLV}api/animes/list`, {
        parse: true,
        scrapy: false,
      });
    } catch (err) {
      return next(err);
    }

    const animes: Anime[] = data.map((item: any) => ({
      index: item[0],
      animeId: item[3],
      title: item[1],
      id: item[2],
      type: item[4],
    }));

    if (animes.length > 0) {
      res.status(200).send({ animes });
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async getLastEpisodes(req: Request, res: Response, next: NextFunction) {
    let data: any;
    let episodes: Episode[] = [];

    try {
      const resultQueryRedis: any = await redisClient.get(
        `lastEpisodes_${hashStringMd5('lastEpisodes')}`,
      );

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        data = await requestGot(
          `${urls.BASE_ANIMEFLV_JELU}LatestEpisodesAdded`,
          {
            parse: true,
            scrapy: false,
          },
        );
      }
    } catch (err) {
      return next(err);
    }

    for (const episode of data.episodes) {
      const formattedEpisode: Episode = {
        id: '12345/' + episode.id,
        title: episode.title,
        image: episode.poster,
        episode: episode.episode,
        servers: await transformUrlServer(episode.servers),
      };

      episodes.push(formattedEpisode);
    }

    if (episodes.length > 0) {
      /* Set the key in the redis cache. */

      redisClient.set(
        `lastEpisodes_${hashStringMd5('lastEpisodes')}`,
        JSON.stringify({ episodes }),
      );

      /* After 24hrs expire the key. */

      redisClient.expireat(
        `lastEpisodes_${hashStringMd5('lastEpisodes')}`,
        new Date().getTime() + 86400000,
      );

      res.status(200).json({
        episodes,
      });
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async getContentTv(req: Request, res: Response, next: NextFunction) {
    const { type, page } = req.params;
    const url = 'tv';
    let data: any;

    try {
      const resultQueryRedis: any = await redisClient.get(
        `contentTv_${hashStringMd5(`${type}:${page}`)}`,
      );

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        data = await requestGot(
          `${urls.BASE_ANIMEFLV_JELU}${
            url.charAt(0).toUpperCase() + url.slice(1)
          }/${type}/${page}`,
          {
            parse: true,
            scrapy: false,
          },
        );
      }
    } catch (err) {
      return next(err);
    }

    const animes: Movie[] = data[url].map((item: any) => {
      return {
        id: item.id,
        title: item.title,
        type: url,
        page: page,
        banner: item.banner,
        image: item.poster,
        synopsis: item.synopsis,
        status: item.debut,
        rate: item.rating,
        genres: item.genres.map((genre: any) => genre),
        episodes: item.episodes.map((episode: any) => episode),
      };
    });

    if (animes.length > 0) {
      /* Set the key in the redis cache. */

      redisClient.set(
        `contentTv_${hashStringMd5(`${type}:${page}`)}`,
        JSON.stringify({ animes }),
      );

      /* After 24hrs expire the key. */

      redisClient.expireat(
        `contentTv_${hashStringMd5(`${type}:${page}`)}`,
        new Date().getTime() + 86400000,
      );

      res.status(200).json({
        animes,
      });
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async getContentSpecial(req: Request, res: Response, next: NextFunction) {
    const { type, page } = req.params;
    const url = 'special';
    let data: any;

    try {
      const resultQueryRedis: any = await redisClient.get(
        `contentSpecial_${hashStringMd5(`${type}:${page}`)}`,
      );

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        data = await requestGot(
          `${urls.BASE_ANIMEFLV_JELU}${
            url.charAt(0).toUpperCase() + url.slice(1)
          }/${type}/${page}`,
          {
            parse: true,
            scrapy: false,
          },
        );
      }
    } catch (err) {
      return next(err);
    }

    const animes: Movie[] = data[url].map((item: any) => {
      return {
        id: item.id,
        title: item.title,
        type: url,
        page: page,
        banner: item.banner,
        image: item.poster,
        synopsis: item.synopsis,
        status: item.debut,
        rate: item.rating,
        genres: item.genres.map((genre: any) => genre),
        episodes: item.episodes.map((episode: any) => episode),
      };
    });

    if (animes.length > 0) {
      /* Set the key in the redis cache. */

      redisClient.set(
        `contentSpecial_${hashStringMd5(`${type}:${page}`)}`,
        JSON.stringify({ animes }),
      );

      /* After 24hrs expire the key. */

      redisClient.expireat(
        `contentSpecial_${hashStringMd5(`${type}:${page}`)}`,
        new Date().getTime() + 86400000,
      );

      res.status(200).json({
        animes,
      });
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async getContentOva(req: Request, res: Response, next: NextFunction) {
    const { type, page } = req.params;
    const url = 'ova';
    let data: any;

    try {
      const resultQueryRedis: any = await redisClient.get(
        `contentOva_${hashStringMd5(`${type}:${page}`)}`,
      );

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        data = await requestGot(
          `${urls.BASE_ANIMEFLV_JELU}${
            url.charAt(0).toUpperCase() + url.slice(1)
          }/${type}/${page}`,
          {
            parse: true,
            scrapy: false,
          },
        );
      }
    } catch (err) {
      return next(err);
    }

    const animes: Movie[] = data[url].map((item: any) => {
      return {
        id: item.id,
        title: item.title,
        type: url,
        page: page,
        banner: item.banner,
        image: item.poster,
        synopsis: item.synopsis,
        status: item.debut,
        rate: item.rating,
        genres: item.genres.map((genre: any) => genre),
        episodes: item.episodes.map((episode: any) => episode),
      };
    });

    if (animes.length > 0) {
      /* Set the key in the redis cache. */

      redisClient.set(
        `contentOva_${hashStringMd5(`${type}:${page}`)}`,
        JSON.stringify({ animes }),
      );

      /* After 24hrs expire the key. */

      redisClient.expireat(
        `contentOva_${hashStringMd5(`${type}:${page}`)}`,
        new Date().getTime() + 86400000,
      );

      res.status(200).json({
        animes,
      });
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async getContentMovie(req: Request, res: Response, next: NextFunction) {
    const { type, page } = req.params;
    const url = 'movies';
    let data: any;

    try {
      const resultQueryRedis: any = await redisClient.get(
        `contentMovie_${hashStringMd5(`${type}:${page}`)}`,
      );

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        data = await requestGot(
          `${urls.BASE_ANIMEFLV_JELU}${
            url.charAt(0).toUpperCase() + url.slice(1)
          }/${type}/${page}`,
          {
            parse: true,
            scrapy: false,
          },
        );
      }
    } catch (err) {
      return next(err);
    }

    const animes: Movie[] = data[url].map((item: any) => {
      return {
        id: item.id,
        title: item.title,
        type: url,
        page: page,
        banner: item.banner,
        image: item.poster,
        synopsis: item.synopsis,
        status: item.debut,
        rate: item.rating,
        genres: item.genres.map((genre: any) => genre),
        episodes: item.episodes.map((episode: any) => episode),
      };
    });

    if (animes.length > 0) {
      /* Set the key in the redis cache. */

      redisClient.set(
        `contentMovie_${hashStringMd5(`${type}:${page}`)}`,
        JSON.stringify({ animes }),
      );

      /* After 24hrs expire the key. */

      redisClient.expireat(
        `contentMovie_${hashStringMd5(`${type}:${page}`)}`,
        new Date().getTime() + 86400000,
      );

      res.status(200).json({
        animes,
      });
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async getEpisodes(req: Request, res: Response, next: NextFunction) {
    const { title } = req.params;
    let searchAnime: ModelA | null;
    let episodes: any;

    try {
      const resultQueryRedis: any = await redisClient.get(
        `episodes_${hashStringMd5(title)}`,
      );

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        searchAnime = await AnimeModel.findOne({ title: { $eq: title } });
      }
    } catch (err) {
      return next(err);
    }

    if (!searchAnime?.jkanime) {
      episodes = await animeFlvInfo(searchAnime?.id);
    } else {
      episodes = await jkanimeInfo(searchAnime?.id);
    }

    if (episodes) {
      /* Set the key in the redis cache. */

      redisClient.set(
        `episodes_${hashStringMd5(title)}`,
        JSON.stringify({ episodes }),
      );

      /* After 24hrs expire the key. */

      redisClient.expireat(
        `episodes_${hashStringMd5(title)}`,
        new Date().getTime() + 86400000,
      );

      res.status(200).json({ episodes });
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }

  async getServers(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    let data: any;

    try {
      const resultQueryRedis: any = await redisClient.get(
        `servers_${hashStringMd5(id)}`,
      );

      if (resultQueryRedis) {
        const resultRedis: any = JSON.parse(resultQueryRedis);

        return res.status(200).json(resultRedis);
      } else {
        if (isNaN(parseInt(id.split('/')[0]))) {
          data = await videoServersJK(id);
        } else {
          data = await requestGot(
            `${urls.BASE_ANIMEFLV_JELU}GetAnimeServers/${id}`,
            { parse: true, scrapy: false },
          );

          data = await transformUrlServer(data.servers);
        }

        if (data) {
          /* Set the key in the redis cache. */

          redisClient.set(
            `servers_${hashStringMd5(id)}`,
            JSON.stringify({ servers: data }),
          );

          /* After 24hrs expire the key. */

          redisClient.expireat(
            `servers_${hashStringMd5(id)}`,
            new Date().getTime() + 86400000,
          );

          res.status(200).json({ servers: data });
        } else {
          res.status(500).json({ message: 'Aruppi lost in the shell' });
        }
      }
    } catch (err) {
      return next(err);
    }
  }

  async getRandomAnime(req: Request, res: Response, next: NextFunction) {
    let animeQuery: ModelA[] | null;
    let animeResult: any;

    try {
      animeQuery = await AnimeModel.aggregate([{ $sample: { size: 1 } }]);
    } catch (err) {
      return next(err);
    }

    if (!animeQuery[0].jkanime) {
      animeResult = {
        title: animeQuery[0].title || null,
        poster: animeQuery[0].poster || null,
        synopsis: animeQuery[0].description || null,
        status: animeQuery[0].state || null,
        type: animeQuery[0].type || null,
        rating: animeQuery[0].score || null,
        genres: animeQuery[0].genres || null,
        moreInfo: [await animeExtraInfo(animeQuery[0].mal_id)],
        promo: await getAnimeVideoPromo(animeQuery[0].mal_id),
        characters: await getAnimeCharacters(animeQuery[0].mal_id),
        related: await getRelatedAnimesFLV(animeQuery[0].id),
      };
    } else {
      animeResult = {
        title: animeQuery[0].title || null,
        poster: animeQuery[0].poster || null,
        synopsis: animeQuery[0].description || null,
        status: animeQuery[0].state || null,
        type: animeQuery[0].type || null,
        rating: animeQuery[0].score || null,
        genres: animeQuery[0].genres || null,
        moreInfo: [await animeExtraInfo(animeQuery[0].mal_id)],
        promo: await getAnimeVideoPromo(animeQuery[0].mal_id),
        characters: await getAnimeCharacters(animeQuery[0].mal_id),
        related: await getRelatedAnimesMAL(animeQuery[0].mal_id),
      };
    }

    if (animeResult) {
      res.set('Cache-Control', 'no-store');
      res.status(200).json(animeResult);
    } else {
      res.status(500).json({ message: 'Aruppi lost in the shell' });
    }
  }
}
