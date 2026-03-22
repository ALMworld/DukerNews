/**
 * form-context.ts — App-wide TanStack Form hook with pre-bound field components.
 *
 * Uses createFormHook composition pattern so each form field is a
 * one-liner instead of a verbose render-prop block.
 */
import { createFormHookContexts, createFormHook } from '@tanstack/react-form'
import { TextField } from './fields/TextField'
import { TextAreaField } from './fields/TextAreaField'
import { PillField } from './fields/PillField'
import { SubscribeButton } from './fields/SubscribeButton'

export const { fieldContext, formContext, useFieldContext, useFormContext } =
    createFormHookContexts()

export const { useAppForm, withForm } = createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
        TextField,
        TextAreaField,
        PillField,
    },
    formComponents: {
        SubscribeButton,
    },
})
