import { Link } from '@tanstack/react-router'
import { Menu, Moon, Sun } from 'lucide-react'
import AccountSelector from './AccountSelector'
import ConnectButton from './ConnectButton'
import { useTheme } from './providers/themeProvider'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { Wordmark } from './Wordmark'

const NAV = [
  { label: 'Home', href: '/', exact: true },
  { label: 'New Proposal', href: '/tc/new', exact: false },
  { label: 'About', href: '/about', exact: false }
] as const

export default function Header() {
  const { actualTheme, setTheme } = useTheme()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          {/* Mobile hamburger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                aria-label="Menu"
              >
                <Menu className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <Link to="/">Home</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/tc/new">New Proposal</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/about">About</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link
            to="/"
            aria-label="Radix DAO — home"
            className="flex items-center gap-2"
          >
            <Wordmark />
            <span className="font-mono text-[0.65625rem] uppercase tracking-[0.09em] text-muted-foreground">
              v2
            </span>
          </Link>

          {/* Nav items turn accent when current — the system's only nav state. */}
          <nav
            aria-label="Primary"
            className="hidden sm:flex items-center gap-8"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                activeOptions={item.exact ? { exact: true } : undefined}
                activeProps={{
                  className: 'text-primary',
                  'aria-current': 'page'
                }}
                inactiveProps={{ className: 'text-foreground' }}
                className="text-[0.90625rem] font-semibold transition-colors duration-150 hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {actualTheme === 'dark' ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>

          <AccountSelector />
          <ConnectButton />
        </div>
      </div>
    </header>
  )
}
