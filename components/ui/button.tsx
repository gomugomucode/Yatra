import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        secondary: "bg-accent/10 border border-accent/20 text-accent-foreground hover:bg-accent/20",
        outline: "border border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground",
        link: "text-accent-foreground underline-offset-4 hover:underline",
        ghost: "hover:bg-muted/50 hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-14 rounded-xl px-8 text-base",
        icon: "h-11 w-11",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button(
  props: React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
      magnetic?: boolean
    }
) {
  const {
    className,
    variant,
    size,
    asChild = false,
    magnetic = true,
    style,
    onMouseMove,
    onMouseLeave,
    ...rest
  } = props

  const [magnetStyle, setMagnetStyle] = React.useState<React.CSSProperties>()

  const handleMouseMove = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!magnetic) {
        onMouseMove?.(event)
        return
      }

      const target = event.currentTarget
      const rect = target.getBoundingClientRect()
      const offsetX = event.clientX - (rect.left + rect.width / 2)
      const offsetY = event.clientY - (rect.top + rect.height / 2)
      const strength = 0.12

      setMagnetStyle({
        transform: `translate3d(${offsetX * strength}px, ${
          offsetY * strength
        }px, 0)`,
      })

      onMouseMove?.(event)
    },
    [magnetic, onMouseMove]
  )

  const handleMouseLeave = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (magnetic) {
        setMagnetStyle(undefined)
      }
      onMouseLeave?.(event)
    },
    [magnetic, onMouseLeave]
  )

  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      style={{ ...(style as React.CSSProperties), ...(magnetStyle ?? {}) }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...rest}
    />
  )
}

export { Button, buttonVariants }
