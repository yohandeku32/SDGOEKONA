import { connect } from '@tidbcloud/serverless';

export default {
  async fetch() {
    try {
      const databaseUrl = process.env.DATABASE_URL;

      if (!databaseUrl) {
        return Response.json(
          {
            status: 'error',
            message: 'DATABASE_URL belum ditemukan di Vercel',
          },
          { status: 500 }
        );
      }

      const conn = connect({
        url: databaseUrl,
      });

      const database = await conn.execute(
        'SELECT DATABASE() AS database_name'
      );

      const tables = await conn.execute(
        'SHOW TABLES'
      );

      return Response.json({
        status: 'success',
        message: 'Vercel berhasil terhubung ke TiDB',
        database,
        tables,
      });

    } catch (error) {
      console.error(error);

      return Response.json(
        {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
        { status: 500 }
      );
    }
  },
};
