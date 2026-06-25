import type { Metadata } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/auth-context'
import { AuthInterceptor } from '@/components/auth/auth-interceptor'
import { ThemeProvider } from '@/components/theme/theme-provider'

const display = Fraunces({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '900'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ERP Universal — Operação de Alta Performance',
  description: 'O ERP que sua operação merece. Editorial em clareza, brutal em performance.',
}

const themeBootstrap = `
(function() {
  try {
    var stored = localStorage.getItem('erp:theme');
    if (stored !== 'dark' && stored !== 'light') {
      var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      stored = prefersLight ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', stored);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            <AuthInterceptor />
            {props.children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
