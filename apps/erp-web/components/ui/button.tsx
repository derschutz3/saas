'use client'

import * as React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'destructive'
  size?: 'default' | 'sm' | 'icon'
  asChild?: boolean
}

export function Button({ className = '', variant = 'default', size = 'default', ...props }: ButtonProps) {
  return (
    <button
      className={`${variant === 'default' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : variant === 'outline' ? 'btn-ghost' : 'btn-ghost'} ${
        size === 'sm' ? 'h-8 px-3 text-xs' : size === 'icon' ? 'btn-icon size-9' : ''
      } ${className}`}
      {...props}
    />
  )
}
