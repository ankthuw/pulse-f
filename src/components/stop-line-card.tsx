import React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Coffee, BookOpen } from "lucide-react"

interface StopLineCardProps {
  readCount: number
  onContinue: () => void
  onShowExplainers: () => void
}

export function StopLineCard({ readCount, onContinue, onShowExplainers }: StopLineCardProps) {
  return (
    <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 shadow-lg">
      <CardContent className="p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="p-3 bg-primary/10 rounded-full">
            <Coffee className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h3 className="text-xl font-bold mb-2 text-foreground">
          You've read enough for now
        </h3>
        <p className="mb-6 text-muted-foreground max-w-md mx-auto">
          Take a break or switch to deeper explainers for more context.
        </p>
        <div className="flex justify-center gap-3 flex-wrap">
          <Button
            onClick={onShowExplainers}
            size="lg"
            className="gap-2"
          >
            <BookOpen className="h-4 w-4" />
            Show Explainers
          </Button>
          <Button
            onClick={onContinue}
            variant="outline"
            size="lg"
          >
            Keep Browsing
          </Button>
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          Articles read: {readCount}
        </div>
      </CardContent>
    </Card>
  )
}
