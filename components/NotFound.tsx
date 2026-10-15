import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

const containerVariants: any = {
  hidden: { 
    opacity: 0,
    y: 30
  },
  visible: { 
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delayChildren: 0.1,
      staggerChildren: 0.1
    }
  }
};

const itemVariants: any = {
  hidden: { 
    opacity: 0,
    y: 20
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.6
    }
  }
};

const numberVariants: any = {
  hidden: (direction: number) => ({
    opacity: 0,
    x: direction * 40,
    y: 15,
    rotate: direction * 5
  }),
  visible: {
    opacity: 0.9,
    x: 0,
    y: 0,
    rotate: 0,
    transition: {
      duration: 0.8
    }
  }
};

const ghostVariants: any = {
  hidden: { 
    scale: 0.8,
    opacity: 0,
    y: 15,
    rotate: -5
  },
  visible: { 
    scale: 1,
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: {
      duration: 0.6,
      ease: [0.43, 0.13, 0.23, 0.96]
    }
  },
  hover: {
    scale: 1.1,
    y: -10,
    rotate: [0, -5, 5, -5, 0],
    transition: {
      duration: 0.8,
      ease: "easeInOut",
      rotate: {
        duration: 2,
        ease: "linear",
        repeat: Infinity,
        repeatType: "reverse"
      }
    }
  },
  floating: {
    y: [-5, 5],
    transition: {
      y: {
        duration: 2,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "reverse"
      }
    }
  }
};

export function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a15] px-4 font-sans overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div 
          className="text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <div className="flex items-center justify-center gap-4 md:gap-6 mb-8 md:mb-12">
            <motion.span 
              className="text-[80px] md:text-[120px] font-black text-white opacity-90 select-none"
              variants={numberVariants}
              custom={-1}
            >
              4
            </motion.span>
            <motion.div
              variants={ghostVariants}
              whileHover="hover"
              animate={["visible", "floating"]}
            >
              <img
                src="https://cdn.21st.dev/assets/mirror/88/8848c4fd858052c49c5a5d7267489c02b021c6cf3e31bfec02787e16f1ab7d0e.png"
                alt="Ghost"
                className="w-[80px] h-[80px] md:w-[120px] md:h-[120px] object-contain select-none drop-shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                draggable="false"
              />
            </motion.div>
            <motion.span 
              className="text-[80px] md:text-[120px] font-black text-white opacity-90 select-none"
              variants={numberVariants}
              custom={1}
            >
              4
            </motion.span>
          </div>
          
          <motion.h1 
            className="text-3xl md:text-5xl font-black text-white mb-4 md:mb-6 select-none drop-shadow-lg"
            variants={itemVariants}
          >
            Boo! Page missing!
          </motion.h1>
          
          <motion.p 
            className="text-lg md:text-xl text-gray-400 mb-8 md:mb-12 select-none"
            variants={itemVariants}
          >
            Whoops! This page must be a ghost - it's not here!
          </motion.p>

          <motion.div 
            variants={itemVariants}
            whileHover={{ 
              scale: 1.05,
              transition: {
                duration: 0.3,
                ease: 'easeOut'
              }
            }}
          >
            <Link 
              to="/"
              className="inline-block bg-primary text-black px-8 py-3 rounded-full text-lg font-bold hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all select-none uppercase tracking-wide"
            >
              Find shelter
            </Link>
          </motion.div>

          <motion.div 
            className="mt-12"
            variants={itemVariants}
          >
            <Link
              to="/"
              className="text-gray-500 hover:text-primary transition-colors underline select-none text-sm font-bold tracking-widest uppercase"
            >
              Return Home
            </Link>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
