export const isProduction = process.env.NODE_ENV === 'production';

export const safeConsole = {
  log: (...args: any[]) => !isProduction && console.log(...args),
  error: (...args: any[]) => !isProduction && console.error(...args),
  warn: (...args: any[]) => !isProduction && console.warn(...args),
};

export const guardProduction = <T>(devValue: T, prodValue: T): T => {
  return isProduction ? prodValue : devValue;
};
