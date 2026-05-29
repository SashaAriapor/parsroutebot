let accessToken: string | null = null;

export const auth = {
  getToken: () => accessToken,
  setToken: (token: string) => { accessToken = token; },
  clearToken: () => { accessToken = null; },
  isLoggedIn: () => accessToken !== null,
};
