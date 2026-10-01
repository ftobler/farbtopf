import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

function sizeButton(text: string) {
  return screen.getByRole('button', { name: new RegExp(text) })
}

function openDialog() {
  fireEvent.click(sizeButton('800 × 600 px'))
  return screen.getByRole('dialog', { name: 'Canvas size' })
}

describe('App canvas size dialog', () => {
  it('opens from the status bar prefilled with the current size', () => {
    render(<App />)
    openDialog()
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('800')
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('600')
  })

  it('resizes the canvas as one undoable step', () => {
    render(<App />)
    openDialog()
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '320' } })
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '900' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sizeButton('320 × 900 px')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(sizeButton('800 × 600 px')).toBeTruthy()
  })

  it('marks the document as unsaved', () => {
    render(<App />)
    expect(document.title).toBe('Farbtopf')
    openDialog()
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '320' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(document.title).toBe('*Farbtopf')
  })

  it('leaves the canvas alone on Escape', () => {
    render(<App />)
    openDialog()
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '320' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sizeButton('800 × 600 px')).toBeTruthy()
  })
})
