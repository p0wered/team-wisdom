import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary'

type CommonProps = {
  variant?: Variant
  className?: string
  children: ReactNode
}

/** An in-app route: rendered as a router <Link>. */
type RouteButtonProps = CommonProps & Omit<LinkProps, 'className' | 'children'> & { to: LinkProps['to'] }
/** An external or same-page address: rendered as a plain <a>. */
type AnchorButtonProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'> & { href: string; to?: never }
/** An action on the page: rendered as a <button>. */
type ActionButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { to?: never; href?: never }

export type ButtonProps = RouteButtonProps | AnchorButtonProps | ActionButtonProps

/**
 * The site's one button. The element follows what it does: `to` → router
 * link, `href` → link, neither → <button> (type="button" unless set).
 */
export function Button(props: ButtonProps) {
  const { variant = 'primary', className, children, ...rest } = props
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ')

  if ('to' in rest && rest.to !== undefined) {
    return (
      <Link {...(rest as Omit<RouteButtonProps, keyof CommonProps>)} className={classes}>
        {children}
      </Link>
    )
  }
  if ('href' in rest && rest.href !== undefined) {
    return (
      <a {...(rest as Omit<AnchorButtonProps, keyof CommonProps>)} className={classes}>
        {children}
      </a>
    )
  }
  const { type = 'button', ...buttonRest } = rest as Omit<ActionButtonProps, keyof CommonProps>
  return (
    <button {...buttonRest} type={type} className={classes}>
      {children}
    </button>
  )
}
