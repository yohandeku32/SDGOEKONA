export default {
  async fetch() {
    return Response.json({
      vercel_env: process.env.VERCEL_ENV || null,
      database_url: !!process.env.DATABASE_URL,
      apps_script_url: !!process.env.APPS_SCRIPT_URL,
    });
  },
};
