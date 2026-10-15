declare module 'framer-motion' {
  const motion: any;
  export const AnimatePresence: any;
  export const MotionConfig: any;
  export const useMotionValue: any;
  export const useSpring: any;
  export const useTransform: any;
  export const useMotionTemplate: any;
  export const useAnimation: any;
  export const motionValue: any;
  export type MotionValue<T = any> = any;
  export type SpringOptions = Record<string, any>;
  export { motion };
}

declare module 'motion/react' {
  export const motion: any;
  export const AnimatePresence: any;
}

declare module 'tailwind-merge' {
  export const twMerge: (...inputs: any[]) => string;
}
